import { EmailSendStatus, EmailType, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { deserializeAttachments } from '@/lib/email/email-attachments';
import { EmailSendError } from '@/lib/email/email-provider';
import { getEmailProvider } from '@/lib/email/email-provider-factory';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGETS,
  VIEW_AUDIT_ACTIONS,
  writeAuditLog,
} from '@/services/audit-service';

/** 이메일 발송 이력 / 감사 로그 조회 (관리자 전용) */

export type EmailLogFilter = {
  reservationNo?: string;
  emailType?: EmailType;
  sendStatus?: EmailSendStatus;
  page?: number;
  pageSize?: number;
};

export async function listEmailLogs(filter: EmailLogFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const where: Prisma.EmailSendLogWhereInput = {
    ...(filter.emailType ? { emailType: filter.emailType } : {}),
    ...(filter.sendStatus ? { sendStatus: filter.sendStatus } : {}),
    ...(filter.reservationNo
      ? { reservation: { reservationNo: { contains: filter.reservationNo } } }
      : {}),
  };

  const [totalCount, rows] = await Promise.all([
    prisma.emailSendLog.count({ where }),
    prisma.emailSendLog.findMany({
      where,
      orderBy: { emailLogId: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        emailLogId: true,
        emailType: true,
        recipientEmail: true,
        subject: true,
        sendStatus: true,
        providerMessageId: true,
        failReason: true,
        /** 목록에는 원문 자체가 아니라 재발송 가능 여부만 필요해 boolean 으로만 쓴다. */
        bodyHtml: true,
        resendOfLogId: true,
        requestedAt: true,
        sentAt: true,
        reservation: { select: { reservationId: true, reservationNo: true } },
      },
    }),
  ]);

  // 재발송 가능 여부: FAILED 이면서, 같은 실패 건(원본 기준)에 더 나중 시도가 없어야 한다.
  // 이미 재발송에 성공/재시도한 뒤인데도 오래된 실패 행에서 또 재발송하면 중복 발송이 된다.
  const rootIds = [...new Set(rows.map((row) => row.resendOfLogId ?? row.emailLogId))];
  const threadRows = rootIds.length
    ? await prisma.emailSendLog.findMany({
        where: { OR: [{ emailLogId: { in: rootIds } }, { resendOfLogId: { in: rootIds } }] },
        select: { emailLogId: true, resendOfLogId: true, sendStatus: true },
      })
    : [];
  const latestByRoot = new Map<number, number>();
  const resolvedRoots = new Set<number>();
  for (const row of threadRows) {
    const root = row.resendOfLogId ?? row.emailLogId;
    latestByRoot.set(root, Math.max(latestByRoot.get(root) ?? 0, row.emailLogId));
    if (row.sendStatus === EmailSendStatus.SUCCESS) resolvedRoots.add(root);
  }

  const items = rows.map((row) => {
    const root = row.resendOfLogId ?? row.emailLogId;
    // 같은 실패 건이 다른 시도에서 이미 성공했으면 "해결됨" — 재발송 버튼 대신
    // "재발송" 칸에 완료 표시만 남긴다. 상태 칸은 이 행 자체의 결과를 그대로 보여준다.
    const resolved = row.sendStatus === EmailSendStatus.FAILED && resolvedRoots.has(root);
    const canResend =
      row.sendStatus === EmailSendStatus.FAILED &&
      !resolved &&
      Boolean(row.bodyHtml) &&
      latestByRoot.get(root) === row.emailLogId;
    return { ...row, canResend, resolved };
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/**
 * 발송 실패한 이메일을 같은 내용 그대로 재발송한다.
 *
 * 원본 실패 행은 절대 고치지 않고 그대로 둔다 — "실패했었다"는 사실 자체가 이력이라
 * 성공으로 덮어쓰면 감사 로그로도 되살릴 수 없는 정보가 사라진다. 대신 재발송 시도를
 * resendOfLogId 로 원본(항상 최초 원본 기준)에 연결한 새 행으로 남긴다.
 *
 * 예약 상태를 다시 조회해 새로 조립하지 않고, 실패 당시 실제로 만들어졌던
 * 제목/본문(body_html, body_text)을 그대로 다시 보낸다 — 재발송 시점에 예약이
 * 이미 바뀌었어도(반려/취소 등) 원래 보내려던 내용과 다른 메일이 나가지 않는다.
 */
export async function resendFailedEmail(
  emailLogId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const log = await prisma.emailSendLog.findUnique({ where: { emailLogId } });
  if (!log) throw new NotFoundError('발송 기록을 찾을 수 없습니다.');
  if (log.sendStatus !== EmailSendStatus.FAILED) {
    throw new ConflictError('발송 실패 건만 재발송할 수 있습니다.', 'EMAIL_NOT_FAILED');
  }
  if (!log.bodyHtml || !log.bodyText) {
    throw new ConflictError(
      '이 기록은 원문이 저장되기 전(구버전)이라 재발송할 수 없습니다.',
      'EMAIL_BODY_MISSING',
    );
  }

  const rootId = log.resendOfLogId ?? log.emailLogId;
  const latestInThread = await prisma.emailSendLog.findFirst({
    where: { OR: [{ emailLogId: rootId }, { resendOfLogId: rootId }] },
    orderBy: { emailLogId: 'desc' },
    select: { emailLogId: true },
  });
  if (latestInThread && latestInThread.emailLogId !== emailLogId) {
    throw new ConflictError(
      '이미 이후에 재발송을 시도한 기록이 있습니다. 최신 시도에서 다시 재발송해 주세요.',
      'EMAIL_NOT_LATEST_ATTEMPT',
    );
  }

  // 첨부(배정 주차 위치 평면도 이미지 등)도 발송 당시 그대로 다시 실어 보낸다 —
  // 본문의 cid: 참조가 첨부 없이 나가면 이미지가 깨진 채로 도착한다.
  const attachments = deserializeAttachments(log.attachmentsJson);

  const attempt = await prisma.emailSendLog.create({
    data: {
      reservationId: log.reservationId,
      emailType: log.emailType,
      recipientEmail: log.recipientEmail,
      subject: log.subject,
      bodyHtml: log.bodyHtml,
      bodyText: log.bodyText,
      attachmentsJson: log.attachmentsJson ?? undefined,
      sendStatus: EmailSendStatus.PENDING,
      resendOfLogId: rootId,
    },
  });

  try {
    const provider = await getEmailProvider();
    const result = await provider.send({
      to: log.recipientEmail,
      subject: log.subject,
      html: log.bodyHtml,
      text: log.bodyText,
      attachments,
    });

    const updated = await prisma.emailSendLog.update({
      where: { emailLogId: attempt.emailLogId },
      data: {
        sendStatus: EmailSendStatus.SUCCESS,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
      },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.EMAIL_RESEND,
      targetType: AUDIT_TARGETS.EMAIL_LOG,
      targetId: attempt.emailLogId,
      detail: { emailType: log.emailType, resendOfLogId: rootId, result: 'SUCCESS' },
      context: actor.requestContext,
    });

    return updated;
  } catch (error) {
    const failReason =
      error instanceof EmailSendError
        ? error.reason
        : error instanceof Error
          ? error.message.slice(0, 500)
          : '알 수 없는 오류';

    const updated = await prisma.emailSendLog.update({
      where: { emailLogId: attempt.emailLogId },
      data: { sendStatus: EmailSendStatus.FAILED, failReason },
    });

    logger.error('이메일 재발송 실패', { emailLogId: attempt.emailLogId, rootId, failReason });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.EMAIL_RESEND,
      targetType: AUDIT_TARGETS.EMAIL_LOG,
      targetId: attempt.emailLogId,
      detail: { emailType: log.emailType, resendOfLogId: rootId, result: 'FAILED', failReason },
      context: actor.requestContext,
    });

    return updated;
  }
}

/**
 * 아직 해결되지 않은 발송 실패 건수 (대시보드 경고 배너용).
 *
 * 실패 건마다 재발송에 성공한 시도가 하나라도 있으면 해결된 것으로 보고 뺀다.
 * "실패 로그 전체 개수"가 아니라 "지금 신청자가 안내를 못 받았을 가능성이 있는 건수" 를 세는
 * 값이라, 재발송 이력(EmailSendLog.resendOfLogId)까지 함께 확인해야 정확하다.
 */
export async function countUnresolvedFailedEmails(): Promise<number> {
  const failedRoots = await prisma.emailSendLog.findMany({
    where: { sendStatus: EmailSendStatus.FAILED, resendOfLogId: null },
    select: { emailLogId: true },
  });
  if (failedRoots.length === 0) return 0;

  const rootIds = failedRoots.map((row) => row.emailLogId);
  const resolvedRoots = await prisma.emailSendLog.findMany({
    where: { resendOfLogId: { in: rootIds }, sendStatus: EmailSendStatus.SUCCESS },
    select: { resendOfLogId: true },
    distinct: ['resendOfLogId'],
  });

  return rootIds.length - resolvedRoots.length;
}

/** 결과에서 제외된 개인정보 열람 기록이 몇 건인지 (감췄다는 사실을 화면에 알리기 위함) */
export async function countViewAuditLogs(actionType?: string): Promise<number> {
  if (actionType) return 0;
  return prisma.auditLog.count({ where: { actionType: { in: [...VIEW_AUDIT_ACTIONS] } } });
}

export type AuditLogFilter = {
  actionType?: string;
  targetType?: string;
  actorAdminId?: number;
  /** 이 액션들은 결과에서 제외한다. (예: 열람 기록을 빼고 변경 이력만 보기) */
  excludeActionTypes?: readonly string[];
  page?: number;
  pageSize?: number;
};

export async function listAuditLogs(filter: AuditLogFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const where: Prisma.AuditLogWhereInput = {
    // 특정 행위 유형을 고른 경우가 우선한다. 제외 목록은 유형을 고르지 않았을 때만 적용된다.
    ...(filter.actionType
      ? { actionType: filter.actionType }
      : filter.excludeActionTypes?.length
        ? { actionType: { notIn: [...filter.excludeActionTypes] } }
        : {}),
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
    ...(filter.actorAdminId ? { actorAdminId: filter.actorAdminId } : {}),
  };

  const [totalCount, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { auditLogId: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        auditLogId: true,
        actionType: true,
        targetType: true,
        targetId: true,
        detailJson: true,
        ipAddress: true,
        createdAt: true,
        actorAdmin: { select: { adminUserId: true, email: true, adminName: true } },
      },
    }),
  ]);

  return {
    items: rows,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}
