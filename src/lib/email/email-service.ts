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
export const DEDUPE_EMAIL_TYPES: readonly EmailType[] = [
  EmailType.EXIT_REMINDER,
  EmailType.ENTRY_REMINDER,
];

/** 입차 예정 알림(당사 담당자용) 발송 기준 시간(분 전). 설정으로 노출하지 않는 고정값이다. */
export const ENTRY_REMINDER_MINUTES = 10;

/**
 * 멱등성 키.
 *
 * `occurrence` 는 "같은 예약이라도 이 값이 바뀌면 다시 보내야 한다" 는 기준이다.
 * EXIT_REMINDER 는 출차 예정 시각을 넣는다 — 예약 시간이 수정되면 새 키가 되어
 * 변경된 시각 기준으로 알림이 다시 나간다. (수정이 없으면 키가 같아 중복 발송은 계속 막힌다)
 */
export function buildDedupeKey(
  reservationId: number,
  emailType: EmailType,
  occurrence?: string | number,
): string {
  const base = `${reservationId}:${emailType}`;
  return occurrence === undefined ? base : `${base}:${occurrence}`;
}

/**
 * EXIT_REMINDER 멱등성 키. 출차 예정 시각(분 단위)에 수신자를 더해 포함한다.
 * 당사 담당자가 매핑되어 있으면 신청자와 담당자 둘 다 받으므로, 수신자별로 키가
 * 갈려야 한 명에게만 보내고 다른 한 명은 빠지는 일이 없다.
 */
export function buildExitReminderDedupeKey(
  reservationId: number,
  visitEndAt: Date,
  recipientEmail: string,
): string {
  return buildDedupeKey(
    reservationId,
    EmailType.EXIT_REMINDER,
    `${visitEndAt.toISOString().slice(0, 16)}:${recipientEmail}`,
  );
}

/** ENTRY_REMINDER 멱등성 키. 입차 예정 시각(분 단위)까지 포함한다. */
export function buildEntryReminderDedupeKey(reservationId: number, visitStartAt: Date): string {
  return buildDedupeKey(
    reservationId,
    EmailType.ENTRY_REMINDER,
    visitStartAt.toISOString().slice(0, 16),
  );
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
  /** dedupe 대상 메일에서 "이 회차" 를 구분하는 값. 지정하지 않으면 예약당 1회가 된다. */
  dedupeOccurrence?: string | number;
}): Promise<EmailDispatchResult> {
  const { reservationId, emailType, to, rendered, dedupeOccurrence } = params;

  const dedupeKey =
    reservationId !== null && requiresDedupe(emailType)
      ? buildDedupeKey(reservationId, emailType, dedupeOccurrence)
      : null;

  let emailLogId: number;
  try {
    const created = await prisma.emailSendLog.create({
      data: {
        reservationId,
        emailType,
        recipientEmail: to,
        subject: rendered.subject.slice(0, 300),
        bodyHtml: rendered.html,
        bodyText: rendered.text,
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
  /** 당사 담당자(직원). ENTRY_REMINDER 수신자를 정하는 데만 쓴다. */
  hostEmployee?: { name: string; email: string } | null;
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
    exitReminderMinutes: settings.exitReminderMinutes,
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

/**
 * 신청자(방문객)가 받는 메일의 수신자 목록.
 *
 * 당사 담당자(employeeUserId)가 매핑되어 있으면 — 대리 신청이든, 방문객 본인 신청에서
 * 담당자를 선택한 경우든 — 방문객이 받는 메일을 담당자도 참조로 함께 받는다.
 * 같은 주소면(드문 경우) 중복 발송하지 않는다.
 */
export function requesterMailRecipients(reservation: ReservationForEmail): string[] {
  const recipients = [reservation.requesterEmail];
  if (reservation.hostEmployee && reservation.hostEmployee.email !== reservation.requesterEmail) {
    recipients.push(reservation.hostEmployee.email);
  }
  return recipients;
}

export function buildAdminDetailUrl(reservationId: number): string {
  return `${getAppBaseUrl()}/admin/reservations/${reservationId}`;
}

export function buildAccessUrl(rawToken: string): string {
  return buildReservationAccessUrl(getAppBaseUrl(), rawToken);
}

type AdminRecipientFlag = 'receiveNewRequest' | 'receiveApprovalAlert';

/** 활성화된 관리자 알림 수신자 목록 */
export async function getAdminRecipients(flag: AdminRecipientFlag): Promise<string[]> {
  const rows = await prisma.adminNotificationEmail.findMany({
    where: { isActive: true, [flag]: true },
    select: { email: true },
    orderBy: { notificationEmailId: 'asc' },
  });
  return rows.map((row) => row.email);
}

/** 1. 신청 접수 (신청자 + 당사 담당자가 매핑되어 있으면 담당자도 함께) */
export async function sendRequestReceivedEmail(
  reservation: ReservationForEmail,
  options: { accessUrl: string; changeDeadlineAt: Date },
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(
    EmailType.REQUEST_RECEIVED,
    await toEmailData(reservation, {
      accessUrl: options.accessUrl,
      changeDeadlineAt: options.changeDeadlineAt,
    }),
  );
  return Promise.all(
    requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.REQUEST_RECEIVED,
        to,
        rendered,
      }),
    ),
  );
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

/** 3. 승인 (신청자 + 당사 담당자가 매핑되어 있으면 담당자도 함께) */
export async function sendApprovedEmail(
  reservation: ReservationForEmail,
  options: { accessUrl: string },
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(
    EmailType.APPROVED,
    await toEmailData(reservation, { accessUrl: options.accessUrl }),
  );
  return Promise.all(
    requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.APPROVED,
        to,
        rendered,
      }),
    ),
  );
}

/** 4. 반려 (신청자 + 당사 담당자가 매핑되어 있으면 담당자도 함께) */
export async function sendRejectedEmail(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(EmailType.REJECTED, await toEmailData(reservation));
  return Promise.all(
    requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.REJECTED,
        to,
        rendered,
      }),
    ),
  );
}

/**
 * 5. 변경 (신청자 + 관리자)
 *
 * 관리자가 직접 고친 경우에는 관리자에게 보내지 않는다. 본인이 화면에서 한 일을
 * 다시 메일로 통보받는 셈이라 알림 가치가 없고, 처리해야 할 신규 신청 메일 사이에
 * 섞여 노이즈가 된다. 변경 이력은 감사 로그와 상태 이력에 이미 남는다.
 */
export async function sendUpdatedEmails(
  reservation: ReservationForEmail,
  options: {
    accessUrl: string;
    previousVisitStartAt: Date;
    previousVisitEndAt: Date;
    /**
     * 신청자가 아니라 관리자가 수정한 경우.
     * 본문 안내 문구가 달라지고, 관리자 수신자에게는 보내지 않는다.
     */
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

  const admins = options.changedByAdmin ? [] : await getAdminRecipients('receiveApprovalAlert');
  return Promise.all([
    ...requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.UPDATED,
        to,
        rendered: requesterMail,
      }),
    ),
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

/** 6. 취소 (신청자 + 당사 담당자가 매핑되어 있으면 담당자도 함께 + 관리자) */
export async function sendCancelledEmails(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(EmailType.CANCELLED, await toEmailData(reservation));
  const admins = await getAdminRecipients('receiveApprovalAlert');
  return Promise.all([
    ...requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.CANCELLED,
        to,
        rendered,
      }),
    ),
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

/** 7. 출차 예정 알림 (신청자 + 당사 담당자가 매핑되어 있으면 담당자도 함께) — 중복 발송 금지 */
export async function sendExitReminderEmail(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult[]> {
  const rendered = renderReservationEmail(EmailType.EXIT_REMINDER, await toEmailData(reservation));
  return Promise.all(
    requesterMailRecipients(reservation).map((to) =>
      sendEmailWithLog({
        reservationId: reservation.reservationId,
        emailType: EmailType.EXIT_REMINDER,
        to,
        rendered,
        // 수신자별로 갈라야 신청자/담당자 중 한쪽만 이미 보냈어도 나머지가 정상 발송된다.
        dedupeOccurrence: `${reservation.visitEndAt.toISOString().slice(0, 16)}:${to}`,
      }),
    ),
  );
}

/**
 * 8. 입차 예정 알림 (당사 담당자) — 방문객(본인 신청/대리 신청 모두) 방문 예정을
 * 매핑된 담당 직원에게 안내한다. 중복 발송 금지.
 */
export async function sendEntryReminderEmail(
  reservation: ReservationForEmail,
): Promise<EmailDispatchResult> {
  if (!reservation.hostEmployee) {
    // 당사 담당자가 없는 예약(과거 데이터)은 보낼 대상이 없으므로 조용히 건너뛴다.
    return { status: 'SKIPPED', emailLogId: null };
  }

  const rendered = renderReservationEmail(
    EmailType.ENTRY_REMINDER,
    await toEmailData(reservation, {
      hostEmployeeName: reservation.hostEmployee.name,
      entryReminderMinutes: ENTRY_REMINDER_MINUTES,
    }),
  );
  return sendEmailWithLog({
    reservationId: reservation.reservationId,
    emailType: EmailType.ENTRY_REMINDER,
    to: reservation.hostEmployee.email,
    rendered,
    dedupeOccurrence: reservation.visitStartAt.toISOString().slice(0, 16),
  });
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
