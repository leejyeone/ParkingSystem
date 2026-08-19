import { EmailSendStatus, EmailType, Prisma, RequesterType, SpaceType } from '@prisma/client';

import { getAppBaseUrl } from '@/lib/env';
import { getEmailProvider } from '@/lib/email/email-provider-factory';
import { EmailSendError } from '@/lib/email/email-provider';
import {
  renderReservationEmail,
  type ReservationEmailData,
  type RenderedEmail,
} from '@/lib/email/email-template-service';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { buildReservationAccessUrl } from '@/lib/tokens';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 이메일 발송 오케스트레이션.
 *
 * - 발송 시도/성공/실패는 모두 email_send_logs 에 기록한다.
 * - EXIT_REMINDER 는 dedupe_key(UNIQUE) 로 DB 레벨 멱등성을 보장한다.
 *   중복 실행되어도 같은 예약에 두 번 발송되지 않는다.
 * - 이메일 실패가 예약 처리 자체를 실패시키면 안 되므로 이 계층은 예외를 던지지 않는다.
 */

/** 성공 발송이 1건만 존재해야 하는 이메일 종류 */
export const DEDUPE_EMAIL_TYPES: readonly EmailType[] = [EmailType.EXIT_REMINDER];

export function buildDedupeKey(reservationId: number, emailType: EmailType): string {
  return `${reservationId}:${emailType}`;
}

export function requiresDedupe(emailType: EmailType): boolean {
  return DEDUPE_EMAIL_TYPES.includes(emailType);
}

export type EmailDispatchResult = {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  emailLogId: number | null;
  failReason?: string;
};

/**
 * 이메일 1건 발송 + 로그 기록.
 *
 * 흐름:
 *   1) PENDING 로그를 먼저 생성한다. (dedupe 대상이면 dedupe_key 를 함께 저장 → 선점)
 *      이미 같은 키가 있으면 P2002 가 발생하고 SKIPPED 로 종료한다.
 *   2) 공급자로 발송한다.
 *   3) 성공 시 SUCCESS + provider_message_id 로 갱신한다.
 *   4) 실패 시 FAILED + fail_reason 으로 갱신하고 dedupe_key 를 해제해 재시도를 허용한다.
 */
export async function sendEmailWithLog(params: {
  reservationId: number | null;
  emailType: EmailType;
  to: string;
  rendered: RenderedEmail;
}): Promise<EmailDispatchResult> {
  const { reservationId, emailType, to, rendered } = params;

  const dedupeKey =
    reservationId !== null && requiresDedupe(emailType)
      ? buildDedupeKey(reservationId, emailType)
      : null;

  let emailLogId: number;
  try {
    const created = await prisma.emailSendLog.create({
      data: {
        reservationId,
        emailType,
        recipientEmail: to,
        subject: rendered.subject.slice(0, 300),
        sendStatus: EmailSendStatus.PENDING,
        dedupeKey,
      },
      select: { emailLogId: true },
    });
    emailLogId = created.emailLogId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info('이미 발송(또는 발송 중)된 메일이라 건너뜁니다.', { emailType, reservationId });
      return { status: 'SKIPPED', emailLogId: null };
    }
    throw error;
  }

  try {
    const provider = await getEmailProvider();
    const result = await provider.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    await prisma.emailSendLog.update({
      where: { emailLogId },
      data: {
        sendStatus: EmailSendStatus.SUCCESS,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
      },
    });
    return { status: 'SUCCESS', emailLogId };
  } catch (error) {
    const failReason =
      error instanceof EmailSendError
        ? error.reason
        : error instanceof Error
          ? error.message.slice(0, 500)
          : '알 수 없는 오류';

    await prisma.emailSendLog.update({
      where: { emailLogId },
      data: {
        sendStatus: EmailSendStatus.FAILED,
        failReason,
        // 실패한 건은 다시 시도할 수 있도록 멱등성 키를 해제한다.
        dedupeKey: null,
        retryCount: { increment: 1 },
      },
    });

    logger.error('이메일 발송 실패', { emailType, emailLogId, failReason });
    return { status: 'FAILED', emailLogId, failReason };
  }
}

// ---------------------------------------------------------------------------
// 예약 관련 고수준 발송 함수
// ---------------------------------------------------------------------------

export type ReservationForEmail = {
  reservationId: number;
  reservationNo: string;
  requesterType: RequesterType;
  requesterName: string;
  requesterEmail: string;
  companyOrBranchName: string;
  vehicleNo: string;
  visitStartAt: Date;
  visitEndAt: Date;
  rejectionReason?: string | null;
  cancelReason?: string | null;
  assignedSpace?: { spaceCode: string; spaceType: SpaceType } | null;
};

/**
 * 메일 본문 데이터 조립.
 *
 * 주차면 배정 사용 여부를 시스템 설정에서 읽어 함께 넘긴다.
 * 배정을 끈 운영에서는 템플릿이 "배정 주차 위치" 행과 관련 안내 문구를 모두 생략한다.
 */
async function toEmailData(
  reservation: ReservationForEmail,
  extra?: Partial<ReservationEmailData>,
): Promise<ReservationEmailData> {
  const settings = await getSystemSettings();
  return {
    spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
    reservationNo: reservation.reservationNo,
    requesterName: reservation.requesterName,
    requesterType: reservation.requesterType,
    companyOrBranchName: reservation.companyOrBranchName,
    vehicleNo: reservation.vehicleNo,
    visitStartAt: reservation.visitStartAt,
    visitEndAt: reservation.visitEndAt,
    assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
    assignedSpaceType: reservation.assignedSpace?.spaceType ?? null,
    rejectionReason: reservation.rejectionReason ?? null,
    cancelReason: reservation.cancelReason ?? null,
    ...extra,
  };
}

export function buildAdminDetailUrl(reservationId: number): string {
  return `${getAppBaseUrl()}/admin/reservations/${reservationId}`;
}

export function buildAccessUrl(rawToken: string): string {
  return buildReservationAccessUrl(getAppBaseUrl(), rawToken);
}

type AdminRecipientFlag =
  | 'receiveNewRequest'
  | 'receiveApprovalAlert'
  | 'receiveDailySummary'
  | 'receiveDoubleParkingAlert';

/** 활성화된 관리자 알림 수신자 목록 */
export async function getAdminRecipients(flag: AdminRecipientFlag): Promise<string[]> {
  const rows = await prisma.adminNotificationEmail.findMany({
    where: { isActive: true, [flag]: true },
    select: { email: true },
    orderBy: { notificationEmailId: 'asc' },
  });
  return rows.map((row) => row.email);
}

/** 1. 신청 접수 (신청자) */
export async function sendRequestReceivedEmail(
  reservation: ReservationForEmail,
  options: { accessUrl: string; changeDeadlineAt: Date },
): Promise<EmailDispatchResult> {
  const rendered = renderReservationEmail(
    EmailType.REQUEST_RECEIVED,
    await toEmailData(reservation, {
      accessUrl: options.accessUrl,
      changeDeadlineAt: options.changeDeadlineAt,
    }),
  );
  return sendEmailWithLog({
    reservationId: reservation.reservationId,
    emailType: EmailType.REQUEST_RECEIVED,
    to: reservation.requesterEmail,
    rendered,
  });
}

/** 2. 신규 신청 알림 (관리자) */
export async function sendNewRequestToAdminEmails(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult[]> {
  const recipients = await getAdminRecipients('receiveNewRequest');
  const rendered = renderReservationEmail(
    EmailType.NEW_REQUEST_TO_ADMIN,
    await toEmailData(reservation, {
      adminDetailUrl: buildAdminDetailUrl(reservation.reservationId),
    }),
  );
  return Promise.all(
    recipients.map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.NEW_REQUEST_TO_ADMIN,
        to,
        rendered,
      }),
    ),
  );
}

/** 3. 승인 (신청자) */
export async function sendApprovedEmail(
  reservation: ReservationForEmail,
  options: { accessUrl: string },
): Promise<EmailDispatchResult> {
  const rendered = renderReservationEmail(
    EmailType.APPROVED,
    await toEmailData(reservation, { accessUrl: options.accessUrl }),
  );
  return sendEmailWithLog({
    reservationId: reservation.reservationId,
    emailType: EmailType.APPROVED,
    to: reservation.requesterEmail,
    rendered,
  });
}

/** 4. 반려 (신청자) */
export async function sendRejectedEmail(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult> {
  const rendered = renderReservationEmail(EmailType.REJECTED, await toEmailData(reservation));
  return sendEmailWithLog({
    reservationId: reservation.reservationId,
    emailType: EmailType.REJECTED,
    to: reservation.requesterEmail,
    rendered,
  });
}

/** 5. 변경 (신청자 + 관리자) */
export async function sendUpdatedEmails(
  reservation: ReservationForEmail,
  options: {
    accessUrl: string;
    previousVisitStartAt: Date;
    previousVisitEndAt: Date;
    /** 신청자가 아니라 관리자가 수정한 경우 (본문 안내 문구가 달라진다) */
    changedByAdmin?: boolean;
  },
): Promise<EmailDispatchResult[]> {
  const data = await toEmailData(reservation, {
    accessUrl: options.accessUrl,
    previousVisitStartAt: options.previousVisitStartAt,
    previousVisitEndAt: options.previousVisitEndAt,
    changedByAdmin: options.changedByAdmin ?? false,
  });
  const requesterMail = renderReservationEmail(EmailType.UPDATED, data);
  const adminMail = renderReservationEmail(EmailType.UPDATED, {
    ...data,
    accessUrl: null,
    adminDetailUrl: buildAdminDetailUrl(reservation.reservationId),
  });

  const admins = await getAdminRecipients('receiveApprovalAlert');
  return Promise.all([
    sendEmailWithLog({
      reservationId: reservation.reservationId,
      emailType: EmailType.UPDATED,
      to: reservation.requesterEmail,
      rendered: requesterMail,
    }),
    ...admins.map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.UPDATED,
        to,
        rendered: adminMail,
      }),
    ),
  ]);
}

/** 6. 취소 (신청자 + 관리자) */
export async function sendCancelledEmails(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(EmailType.CANCELLED, await toEmailData(reservation));
  const admins = await getAdminRecipients('receiveApprovalAlert');
  return Promise.all([
    sendEmailWithLog({
      reservationId: reservation.reservationId,
      emailType: EmailType.CANCELLED,
      to: reservation.requesterEmail,
      rendered,
    }),
    ...admins.map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.CANCELLED,
        to,
        rendered,
      }),
    ),
  ]);
}

/** 7. 출차 예정 알림 (신청자) — 중복 발송 금지 */
export async function sendExitReminderEmail(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult> {
  const rendered = renderReservationEmail(EmailType.EXIT_REMINDER, await toEmailData(reservation));
  return sendEmailWithLog({
    reservationId: reservation.reservationId,
    emailType: EmailType.EXIT_REMINDER,
    to: reservation.requesterEmail,
    rendered,
  });
}

/** 8. 이중주차 안내 (신청자 + 이중주차 알림 수신 관리자) */
export async function sendDoubleParkingNoticeEmails(
  reservation: ReservationForEmail,
  options: { accessUrl: string },
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(
    EmailType.DOUBLE_PARKING_NOTICE,
    await toEmailData(reservation, { accessUrl: options.accessUrl }),
  );
  const adminRendered = renderReservationEmail(
    EmailType.DOUBLE_PARKING_NOTICE,
    await toEmailData(reservation, {
      adminDetailUrl: buildAdminDetailUrl(reservation.reservationId),
    }),
  );
  const admins = await getAdminRecipients('receiveDoubleParkingAlert');

  return Promise.all([
    sendEmailWithLog({
      reservationId: reservation.reservationId,
      emailType: EmailType.DOUBLE_PARKING_NOTICE,
      to: reservation.requesterEmail,
      rendered,
    }),
    ...admins.map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.DOUBLE_PARKING_NOTICE,
        to,
        rendered: adminRendered,
      }),
    ),
  ]);
}

/**
 * 이메일 발송 실패가 본 처리 흐름을 중단시키지 않도록 감싸는 헬퍼.
 * (예약은 이미 커밋된 상태이므로 메일 실패는 로그로만 남긴다)
 */
export async function dispatchQuietly(task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch (error) {
    logger.error('이메일 발송 처리 중 예외', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
