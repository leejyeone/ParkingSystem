import { ChangedByType, EmailSendStatus, EmailType, ReservationStatus } from '@prisma/client';

import {
  buildExitReminderDedupeKey,
  requesterMailRecipients,
  sendExitReminderEmail,
  type ReservationForEmail,
} from '@/lib/email/email-service';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getSystemSettings } from '@/services/settings-service';
import { findSpaceInUseBy } from '@/services/space-assignment-service';

/**
 * 출차 예정 알림 스케줄러 작업.
 *
 * 멱등성
 *  - email_send_logs.dedupe_key 의 UNIQUE 제약으로 DB 레벨에서 중복 발송을 차단한다.
 *  - 조회 단계에서도 이미 성공 발송된 예약을 제외해 불필요한 시도를 줄인다.
 *  → cron 이 중복 실행되거나 동시에 실행되어도 같은 예약에 두 번 발송되지 않는다.
 *
 * 키에는 출차 예정 시각이 들어간다. 예약 시간이 수정되면 키가 달라져
 * 바뀐 시각을 기준으로 알림이 다시 나간다. (수정 전 시각으로 보낸 안내는 이미 틀린 정보다)
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
      // 반복 예약 occurrence 에는 어떤 메일도 보내지 않는다(출차 임박 알림 포함).
      recurringScheduleId: null,
    },
    include: {
      assignedSpace: { select: { spaceCode: true, spaceType: true } },
      employeeUser: { select: { name: true, email: true, deletedAt: true } },
      // 현재 출차 예정 시각 기준으로 이미 보냈는지 판단하려면 키를 봐야 한다.
      emailLogs: {
        where: { emailType: EmailType.EXIT_REMINDER, sendStatus: EmailSendStatus.SUCCESS },
        select: { dedupeKey: true },
      },
    },
    orderBy: { visitEndAt: 'asc' },
  });

  return reservations
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
      // 담당 직원이 그 사이 소프트 삭제됐으면 담당자 없는 예약과 동일하게 취급한다.
      hostEmployee:
        reservation.employeeUser && !reservation.employeeUser.deletedAt
          ? reservation.employeeUser
          : null,
      emailLogs: reservation.emailLogs,
    }))
    .filter((reservation) => {
      // 신청자·담당자 중 한 명이라도 아직 못 받았으면 대상에 남긴다. 이미 받은 수신자는
      // sendExitReminderEmail() 내부의 개별 멱등성 키가 다시 걸러 중복 발송을 막는다.
      const sentKeys = new Set(reservation.emailLogs.map((log) => log.dedupeKey));
      return requesterMailRecipients(reservation).some(
        (to) =>
          !sentKeys.has(
            buildExitReminderDedupeKey(reservation.reservationId, reservation.visitEndAt, to),
          ),
      );
    })
    .map(({ emailLogs: _emailLogs, ...reservation }) => reservation);
}

export async function runExitReminderJob(now: Date = new Date()): Promise<ExitReminderResult> {
  const targets = await findExitReminderTargets(now);

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const target of targets) {
    // 당사 담당자가 매핑되어 있으면 신청자·담당자 2건이 나올 수 있다.
    const results = await sendExitReminderEmail(target);
    for (const result of results) {
      if (result.status === 'SUCCESS') sentCount += 1;
      else if (result.status === 'SKIPPED') skippedCount += 1;
      else failedCount += 1;
    }
  }

  // 스케줄러가 1분마다 호출하므로, 발송할 대상이 없었던 실행은 로그를 남기지 않는다.
  // (cron 라우트 호출자는 아래 반환값을 JSON 응답으로 그대로 받는다)
  if (targets.length > 0) {
    logger.info('출차 예정 알림 작업 완료', {
      targetCount: targets.length,
      sentCount,
      skippedCount,
      failedCount,
    });
  }

  return { targetCount: targets.length, sentCount, skippedCount, failedCount };
}

/**
 * 반복 예약 시리즈에서 "입출차 자동 처리"(autoEntryExitEnabled)를 켠 occurrence 를
 * 예정 시각(visitStartAt/visitEndAt)에 맞춰 자동으로 입차/출차 처리한다.
 *
 * 실제 admin 조작 없이 시스템이 처리하는 것이므로 actualEntryAt/actualExitAt 에는
 * 작업이 실행된 시각이 아니라 원래 예정 시각을 그대로 기록한다 — 스케줄러 실행
 * 간격(기본 60초)만큼의 오차가 기록에 남지 않게 하기 위함이다.
 */
export async function runAutoEntryExitJob(
  now: Date = new Date(),
): Promise<{ enteredCount: number; exitedCount: number }> {
  const settings = await getSystemSettings();
  if (!settings.entryExitManagementEnabled) {
    return { enteredCount: 0, exitedCount: 0 };
  }

  const entryTargets = await prisma.parkingReservation.findMany({
    where: {
      recurringSchedule: { autoEntryExitEnabled: true },
      reservationStatus: ReservationStatus.APPROVED,
      actualEntryAt: null,
      visitStartAt: { lte: now },
    },
    select: { reservationId: true, visitStartAt: true, assignedSpaceId: true },
  });

  let skippedEntryCount = 0;

  for (const target of entryTargets) {
    const entered = await prisma.$transaction(async (tx) => {
      if (target.assignedSpaceId) {
        const inUseBy = await findSpaceInUseBy(target.assignedSpaceId, target.reservationId, tx);
        if (inUseBy) return false;
      }

      await tx.parkingReservation.update({
        where: { reservationId: target.reservationId },
        data: { reservationStatus: ReservationStatus.PARKING, actualEntryAt: target.visitStartAt },
      });
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: target.reservationId,
          previousStatus: ReservationStatus.APPROVED,
          currentStatus: ReservationStatus.PARKING,
          changedByType: ChangedByType.SYSTEM,
          // 실제 수동 입차 처리(markEntry)와 같은 문구를 쓴다 — "반복"이라는 단어로
          // 이 예약이 반복 예약 occurrence 임을 알아채지 못하게 하기 위함이다.
          changeReason: '실제 입차 처리',
        },
      });
      return true;
    });

    if (!entered) skippedEntryCount += 1;
  }

  const exitTargets = await prisma.parkingReservation.findMany({
    where: {
      recurringSchedule: { autoEntryExitEnabled: true },
      reservationStatus: ReservationStatus.PARKING,
      actualExitAt: null,
      visitEndAt: { lte: now },
    },
    select: { reservationId: true, visitEndAt: true },
  });

  for (const target of exitTargets) {
    await prisma.$transaction(async (tx) => {
      await tx.parkingReservation.update({
        where: { reservationId: target.reservationId },
        data: { reservationStatus: ReservationStatus.EXITED, actualExitAt: target.visitEndAt },
      });
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: target.reservationId,
          previousStatus: ReservationStatus.PARKING,
          currentStatus: ReservationStatus.EXITED,
          changedByType: ChangedByType.SYSTEM,
          changeReason: '실제 출차 처리',
        },
      });
    });
  }

  const enteredCount = entryTargets.length - skippedEntryCount;

  if (entryTargets.length > 0 || exitTargets.length > 0) {
    logger.info('반복 예약 입출차 자동 처리 완료', {
      enteredCount,
      skippedEntryCount,
      exitedCount: exitTargets.length,
    });
  }

  return { enteredCount, exitedCount: exitTargets.length };
}
