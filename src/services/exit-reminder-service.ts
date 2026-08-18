import { ChangedByType, EmailSendStatus, EmailType, ReservationStatus } from '@prisma/client';

import { sendExitReminderEmail, type ReservationForEmail } from '@/lib/email/email-service';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 출차 예정 알림 스케줄러 작업.
 *
 * 멱등성
 *  - email_send_logs.dedupe_key 의 UNIQUE 제약으로 DB 레벨에서 중복 발송을 차단한다.
 *  - 조회 단계에서도 이미 성공 발송된 예약을 제외해 불필요한 시도를 줄인다.
 *  → cron 이 중복 실행되거나 동시에 실행되어도 같은 예약에 두 번 발송되지 않는다.
 */

export type ExitReminderResult = {
  targetCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
};

/** cron 지연을 감안한 여유 시간(분). 이미 지난 예약도 이 범위까지는 발송 대상으로 본다. */
const GRACE_MINUTES = 5;

export async function findExitReminderTargets(
  now: Date = new Date(),
): Promise<ReservationForEmail[]> {
  const settings = await getSystemSettings();

  const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60_000);
  const windowEnd = new Date(now.getTime() + settings.exitReminderMinutes * 60_000);

  const reservations = await prisma.parkingReservation.findMany({
    where: {
      reservationStatus: { in: [ReservationStatus.APPROVED, ReservationStatus.PARKING] },
      visitEndAt: { gte: windowStart, lte: windowEnd },
      // 이미 성공 발송된 예약 제외
      emailLogs: {
        none: { emailType: EmailType.EXIT_REMINDER, sendStatus: EmailSendStatus.SUCCESS },
      },
    },
    include: {
      assignedSpace: { select: { spaceCode: true, spaceType: true } },
    },
    orderBy: { visitEndAt: 'asc' },
  });

  return reservations.map((reservation) => ({
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
  }));
}

export async function runExitReminderJob(now: Date = new Date()): Promise<ExitReminderResult> {
  const targets = await findExitReminderTargets(now);

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const target of targets) {
    const result = await sendExitReminderEmail(target);
    if (result.status === 'SUCCESS') sentCount += 1;
    else if (result.status === 'SKIPPED') skippedCount += 1;
    else failedCount += 1;
  }

  logger.info('출차 예정 알림 작업 완료', {
    targetCount: targets.length,
    sentCount,
    skippedCount,
    failedCount,
  });

  return { targetCount: targets.length, sentCount, skippedCount, failedCount };
}

/**
 * 예약 종료 시간이 지났는데도 입차하지 않은 APPROVED 예약을 NO_SHOW 로 전환한다.
 *
 * MVP 에서는 자동 실행하지 않으며(관리자가 화면에서 직접 처리),
 * 추후 스케줄러에서 호출만 하면 되도록 서비스 함수로 분리해 둔다.
 */
export async function runAutoNoShowJob(
  now: Date = new Date(),
  graceMinutes = 30,
): Promise<{ processedCount: number }> {
  const threshold = new Date(now.getTime() - graceMinutes * 60_000);

  const targets = await prisma.parkingReservation.findMany({
    where: {
      reservationStatus: ReservationStatus.APPROVED,
      visitEndAt: { lt: threshold },
      actualEntryAt: null,
    },
    select: { reservationId: true },
  });

  for (const target of targets) {
    await prisma.$transaction(async (tx) => {
      await tx.parkingReservation.update({
        where: { reservationId: target.reservationId },
        data: { reservationStatus: ReservationStatus.NO_SHOW, assignedSpaceId: null },
      });
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: target.reservationId,
          previousStatus: ReservationStatus.APPROVED,
          currentStatus: ReservationStatus.NO_SHOW,
          changedByType: ChangedByType.SYSTEM,
          changeReason: `예약 종료 후 ${graceMinutes}분간 입차 기록 없음(자동 처리)`,
        },
      });
    });
  }

  logger.info('자동 NO_SHOW 처리 완료', { processedCount: targets.length });
  return { processedCount: targets.length };
}
