import { EmailSendStatus, EmailType, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { VIEW_AUDIT_ACTIONS } from '@/services/audit-service';

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
        requestedAt: true,
        sentAt: true,
        reservation: { select: { reservationId: true, reservationNo: true } },
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
        actorAdmin: { select: { adminUserId: true, loginId: true, adminName: true } },
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
