import { EmailSendStatus, EmailType, RequesterType, ReservationStatus } from '@prisma/client';

import {
  buildEntryReminderDedupeKey,
  sendEntryReminderEmail,
  type ReservationForEmail,
} from '@/lib/email/email-service';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 입차 예정 알림(당사 담당자용) 스케줄러 작업.
 *
 * 방문객(본인 신청/직원 대리 신청 모두 requesterType=VISITOR)의 입차 예정 시각
 * 시스템 설정(entryReminderMinutes)분 전에, 매핑된 당사 담당자(employeeUserId)에게 안내 메일을
 * 보낸다. 직원 본인 방문(requesterType=EMPLOYEE)은 본인이 곧 담당자이므로 대상에서 제외한다.
 *
 * 멱등성은 출차 예정 알림과 동일한 방식(email_send_logs.dedupe_key UNIQUE)으로 보장한다.
 */

export type EntryReminderResult = {
  targetCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
};

/** cron 지연을 감안한 여유 시간(분). 이미 지난 예약도 이 범위까지는 발송 대상으로 본다. */
const GRACE_MINUTES = 5;

export async function findEntryReminderTargets(
  now: Date = new Date(),
  entryReminderMinutes?: number,
): Promise<ReservationForEmail[]> {
  const minutes = entryReminderMinutes ?? (await getSystemSettings()).entryReminderMinutes;
  const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60_000);
  const windowEnd = new Date(now.getTime() + minutes * 60_000);

  const reservations = await prisma.parkingReservation.findMany({
    where: {
      reservationStatus: ReservationStatus.APPROVED,
      requesterType: RequesterType.VISITOR,
      employeeUserId: { not: null },
      visitStartAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      assignedSpace: { select: { spaceCode: true, spaceType: true } },
      employeeUser: { select: { name: true, email: true, deletedAt: true } },
      emailLogs: {
        where: { emailType: EmailType.ENTRY_REMINDER, sendStatus: EmailSendStatus.SUCCESS },
        select: { dedupeKey: true },
      },
    },
    orderBy: { visitStartAt: 'asc' },
  });

  return reservations
    // 담당 직원이 그 사이 소프트 삭제됐으면 담당자 없는 예약과 동일하게 취급한다 —
    // 아래 필터가 자연스럽게 대상에서 뺀다.
    .map((reservation) => ({
      ...reservation,
      employeeUser:
        reservation.employeeUser && !reservation.employeeUser.deletedAt
          ? reservation.employeeUser
          : null,
    }))
    .filter((reservation) => reservation.employeeUser !== null)
    .filter((reservation) => {
      const key = buildEntryReminderDedupeKey(reservation.reservationId, reservation.visitStartAt);
      return !reservation.emailLogs.some((log) => log.dedupeKey === key);
    })
    .map((reservation) => ({
      reservationId: reservation.reservationId,
      reservationNo: reservation.reservationNo,
      requesterType: reservation.requesterType,
      requesterName: reservation.requesterName,
      requesterEmail: reservation.requesterEmail,
      companyOrBranchName: reservation.companyOrBranchName,
      vehicleNo: reservation.vehicleNo,
      visitStartAt: reservation.visitStartAt,
      visitEndAt: reservation.visitEndAt,
      assignedSpace: reservation.assignedSpace,
      hostEmployee: reservation.employeeUser,
    }));
}

export async function runEntryReminderJob(now: Date = new Date()): Promise<EntryReminderResult> {
  const settings = await getSystemSettings();
  const targets = await findEntryReminderTargets(now, settings.entryReminderMinutes);

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const target of targets) {
    const result = await sendEntryReminderEmail(target, settings.entryReminderMinutes);
    if (result.status === 'SUCCESS') sentCount += 1;
    else if (result.status === 'SKIPPED') skippedCount += 1;
    else failedCount += 1;
  }

  if (targets.length > 0) {
    logger.info('입차 예정 알림 작업 완료', {
      targetCount: targets.length,
      sentCount,
      skippedCount,
      failedCount,
    });
  }

  return { targetCount: targets.length, sentCount, skippedCount, failedCount };
}
