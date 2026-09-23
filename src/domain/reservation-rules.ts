import { ReservationStatus } from '@prisma/client';

import { formatKstDate, kstMinutesOfDay, parseTimeOfDayToMinutes } from '@/lib/datetime';
import { ValidationError, type FieldErrors } from '@/lib/errors';
import {
  REQUESTER_MODIFIABLE_STATUSES,
  RESERVATION_STATUS_LABEL,
} from '@/domain/reservation-status';
import type { SystemSettingsValues } from '@/domain/system-settings';

/**
 * 예약 시간 관련 순수 비즈니스 규칙.
 * 모든 판정은 UTC Date 를 입력받고, 운영시간 비교만 Asia/Seoul 기준으로 환산한다.
 */

/** 최소 사전 신청 시간 검증. 통과하면 null, 실패하면 오류 메시지 */
export function checkMinimumLeadTime(
  visitStartAt: Date,
  now: Date,
  minLeadMinutes: number,
): string | null {
  const diffMinutes = (visitStartAt.getTime() - now.getTime()) / 60000;
  if (diffMinutes < minLeadMinutes) {
    return `입차 예정 시간은 현재 시각으로부터 최소 ${minLeadMinutes}분 이후여야 합니다.`;
  }
  return null;
}

/** 방문 구간(시작 < 종료, 최대 이용시간) 검증. `allowException` 이면 최대 이용시간 초과는 허용한다. */
export function checkVisitRange(
  visitStartAt: Date,
  visitEndAt: Date,
  maxReservationHours: number,
  options?: { allowException?: boolean },
): string | null {
  if (visitEndAt.getTime() <= visitStartAt.getTime()) {
    return '출차 예정 시간은 입차 예정 시간보다 늦어야 합니다.';
  }
  if (options?.allowException) return null;
  const hours = (visitEndAt.getTime() - visitStartAt.getTime()) / 3_600_000;
  if (hours > maxReservationHours) {
    return `1건당 최대 예약 시간은 ${maxReservationHours}시간입니다.`;
  }
  return null;
}

/** 운영시간(Asia/Seoul) 내 예약인지 검증. `allowException` 이면 같은 날짜 제약·운영시간 제약을 모두 건너뛴다. */
export function checkOperatingHours(
  visitStartAt: Date,
  visitEndAt: Date,
  openTime: string,
  closeTime: string,
  timeZone?: string,
  options?: { allowException?: boolean },
): string | null {
  if (options?.allowException) return null;

  if (formatKstDate(visitStartAt, timeZone) !== formatKstDate(visitEndAt, timeZone)) {
    return '입차와 출차 예정 시간은 같은 날짜여야 합니다.';
  }

  const openMinutes = parseTimeOfDayToMinutes(openTime);
  const closeMinutes = parseTimeOfDayToMinutes(closeTime);

  const startMinutes = kstMinutesOfDay(visitStartAt, timeZone);
  const endMinutes = kstMinutesOfDay(visitEndAt, timeZone);

  if (startMinutes < openMinutes || startMinutes > closeMinutes) {
    return `주차장 운영시간(${openTime} ~ ${closeTime}) 내로 입차 예정 시간을 선택해 주세요.`;
  }
  if (endMinutes > closeMinutes || endMinutes < openMinutes) {
    return `주차장 운영시간(${openTime} ~ ${closeTime}) 내로 출차 예정 시간을 선택해 주세요.`;
  }
  return null;
}

/**
 * 신청/수정 시 공통 시간 규칙 검증. 위반이 있으면 ValidationError 를 던진다.
 */
export function assertReservationTiming(params: {
  visitStartAt: Date;
  visitEndAt: Date;
  now: Date;
  settings: SystemSettingsValues;
  /**
   * 신청자가 예외 신청했거나 관리자가 직접 허용한 경우, 최소 사전 신청 시간·최대
   * 이용시간·운영시간(같은 날짜 포함) 검증을 모두 건너뛴다.
   */
  allowTimingException?: boolean;
}): void {
  const { visitStartAt, visitEndAt, now, settings, allowTimingException } = params;
  const fieldErrors: FieldErrors = {};

  if (!allowTimingException) {
    const leadError = checkMinimumLeadTime(visitStartAt, now, settings.reservationMinLeadMinutes);
    if (leadError) (fieldErrors.visitStartAt ??= []).push(leadError);
  }

  const rangeError = checkVisitRange(visitStartAt, visitEndAt, settings.maxReservationHours, {
    allowException: allowTimingException,
  });
  if (rangeError) (fieldErrors.visitEndAt ??= []).push(rangeError);

  if (!rangeError) {
    const hoursError = checkOperatingHours(
      visitStartAt,
      visitEndAt,
      settings.parkingOpenTime,
      settings.parkingCloseTime,
      settings.appTimeZone,
      { allowException: allowTimingException },
    );
    if (hoursError) (fieldErrors.visitStartAt ??= []).push(hoursError);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('예약 시간을 다시 확인해 주세요.', fieldErrors);
  }
}

/** 신청자의 수정/취소 마감 시각 */
export function getRequesterChangeDeadline(visitStartAt: Date, minLeadMinutes: number): Date {
  return new Date(visitStartAt.getTime() - minLeadMinutes * 60_000);
}

export type RequesterChangeCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * 신청자가 지금 예약을 수정/취소할 수 있는지 판정.
 * - 상태가 REQUESTED(승인 대기)여야 한다.
 * - 방문 시작 minLeadMinutes 분 전까지만 가능하다.
 */
export function checkRequesterCanChange(params: {
  status: ReservationStatus;
  visitStartAt: Date;
  now: Date;
  minLeadMinutes: number;
}): RequesterChangeCheck {
  const { status, visitStartAt, now, minLeadMinutes } = params;

  if (!REQUESTER_MODIFIABLE_STATUSES.includes(status)) {
    return {
      allowed: false,
      reason: `현재 예약 상태(${RESERVATION_STATUS_LABEL[status]})에서는 수정 또는 취소할 수 없습니다. 담당자에게 문의해 주세요.`,
    };
  }

  const deadline = getRequesterChangeDeadline(visitStartAt, minLeadMinutes);
  if (now.getTime() > deadline.getTime()) {
    return {
      allowed: false,
      reason: `방문 시작 ${minLeadMinutes}분 전까지만 수정 또는 취소할 수 있습니다. 담당자에게 문의해 주세요.`,
    };
  }

  return { allowed: true };
}
