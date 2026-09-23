import { formatKstDate, kstMinutesOfDay, parseTimeOfDayToMinutes } from '@/lib/datetime';
import { ValidationError, type FieldErrors } from '@/lib/errors';
import { checkMinimumLeadTime } from '@/domain/reservation-rules';
import type { SystemSettingsValues } from '@/domain/system-settings';

/**
 * 법인 공용 차량 운행 신청 관련 순수 비즈니스 규칙.
 *
 * 방문 예약의 운영시간(parkingOpenTime/CloseTime)과는 별개로 관리되는
 * companyVehicleOperatingStartTime/EndTime 설정을 기준으로 검증한다.
 */

/** 운영 가능 시간대(Asia/Seoul) 내 신청인지 검증. `allowException` 이면 같은 날짜 제약·시간대 제약을 모두 건너뛴다. */
export function checkCompanyVehicleOperatingHours(
  requestStartAt: Date,
  requestEndAt: Date,
  operatingStartTime: string,
  operatingEndTime: string,
  timeZone?: string,
  options?: { allowException?: boolean },
): string | null {
  if (options?.allowException) return null;

  if (formatKstDate(requestStartAt, timeZone) !== formatKstDate(requestEndAt, timeZone)) {
    return '운행 시작과 종료 예정 시간은 같은 날짜여야 합니다.';
  }

  const openMinutes = parseTimeOfDayToMinutes(operatingStartTime);
  const closeMinutes = parseTimeOfDayToMinutes(operatingEndTime);

  const startMinutes = kstMinutesOfDay(requestStartAt, timeZone);
  const endMinutes = kstMinutesOfDay(requestEndAt, timeZone);

  if (startMinutes < openMinutes || startMinutes > closeMinutes) {
    return `법인차량 운행 신청 가능 시간(${operatingStartTime} ~ ${operatingEndTime}) 내로 운행 시작 시간을 선택해 주세요.`;
  }
  if (endMinutes > closeMinutes || endMinutes < openMinutes) {
    return `법인차량 운행 신청 가능 시간(${operatingStartTime} ~ ${operatingEndTime}) 내로 운행 종료 시간을 선택해 주세요.`;
  }
  return null;
}

/**
 * 신청 시 공통 시간 규칙 검증. 위반이 있으면 ValidationError 를 던진다.
 */
export function assertCompanyVehicleTripTiming(params: {
  requestStartAt: Date;
  requestEndAt: Date;
  settings: SystemSettingsValues;
  /** 신청자가 예외 신청했거나 관리자가 직접 허용한 경우, 최대 사용시간·운영시간 검증을 건너뛴다. */
  allowTimingException?: boolean;
}): void {
  const { requestStartAt, requestEndAt, settings, allowTimingException } = params;
  const fieldErrors: FieldErrors = {};

  if (requestEndAt.getTime() <= requestStartAt.getTime()) {
    (fieldErrors.requestEndAt ??= []).push('운행 종료 예정 시간은 시작 예정 시간보다 늦어야 합니다.');
  } else if (!allowTimingException) {
    const hours = (requestEndAt.getTime() - requestStartAt.getTime()) / 3_600_000;
    if (hours > settings.companyVehicleMaxUsageHours) {
      (fieldErrors.requestEndAt ??= []).push(
        `1회 최대 사용 가능 시간은 ${settings.companyVehicleMaxUsageHours}시간입니다.`,
      );
    }
  }

  if (!fieldErrors.requestStartAt && !fieldErrors.requestEndAt) {
    const hoursError = checkCompanyVehicleOperatingHours(
      requestStartAt,
      requestEndAt,
      settings.companyVehicleOperatingStartTime,
      settings.companyVehicleOperatingEndTime,
      settings.appTimeZone,
      { allowException: allowTimingException },
    );
    if (hoursError) (fieldErrors.requestStartAt ??= []).push(hoursError);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('운행 요청 시간을 다시 확인해 주세요.', fieldErrors);
  }
}

/**
 * 신규 신청 시 공통 시간 규칙 검증. 방문 예약과 동일하게 최소 사전 신청 시간
 * (`reservationMinLeadMinutes`)까지 함께 본다 — 관리자 수정(`assertCompanyVehicleTripTiming`)은
 * 방문 예약의 관리자 수정과 마찬가지로 이 리드타임 검증을 받지 않는다.
 * `allowTimingException`이면 이 리드타임 검증도 함께 건너뛴다.
 */
export function assertCompanyVehicleTripCreateTiming(params: {
  requestStartAt: Date;
  requestEndAt: Date;
  now: Date;
  settings: SystemSettingsValues;
  allowTimingException?: boolean;
}): void {
  const { requestStartAt, now, settings, allowTimingException } = params;
  const fieldErrors: FieldErrors = {};

  if (!allowTimingException) {
    const leadError = checkMinimumLeadTime(requestStartAt, now, settings.reservationMinLeadMinutes);
    if (leadError) (fieldErrors.requestStartAt ??= []).push(leadError);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('운행 요청 시간을 다시 확인해 주세요.', fieldErrors);
  }

  assertCompanyVehicleTripTiming(params);
}
