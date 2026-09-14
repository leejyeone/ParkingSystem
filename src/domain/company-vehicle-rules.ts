import { formatKstDate, kstMinutesOfDay, parseTimeOfDayToMinutes } from '@/lib/datetime';
import { ValidationError, type FieldErrors } from '@/lib/errors';
import type { SystemSettingsValues } from '@/domain/system-settings';

/**
 * 법인 공용 차량 운행 신청 관련 순수 비즈니스 규칙.
 *
 * 방문 예약의 운영시간(parkingOpenTime/CloseTime)과는 별개로 관리되는
 * companyVehicleOperatingStartTime/EndTime 설정을 기준으로 검증한다.
 */

/** 운영 가능 시간대(Asia/Seoul) 내 신청인지 검증 */
export function checkCompanyVehicleOperatingHours(
  requestStartAt: Date,
  requestEndAt: Date,
  operatingStartTime: string,
  operatingEndTime: string,
  timeZone?: string,
): string | null {
  const openMinutes = parseTimeOfDayToMinutes(operatingStartTime);
  const closeMinutes = parseTimeOfDayToMinutes(operatingEndTime);

  if (formatKstDate(requestStartAt, timeZone) !== formatKstDate(requestEndAt, timeZone)) {
    return '운행 시작과 종료 예정 시간은 같은 날짜여야 합니다.';
  }

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

/** 10분 단위 시각인지 검증(분이 10의 배수). 화면 step=600 을 우회해도 서버에서 강제한다. */
export function isTenMinuteAligned(date: Date, timeZone?: string): boolean {
  return kstMinutesOfDay(date, timeZone) % 10 === 0;
}

/**
 * 신청 시 공통 시간 규칙 검증. 위반이 있으면 ValidationError 를 던진다.
 */
export function assertCompanyVehicleTripTiming(params: {
  requestStartAt: Date;
  requestEndAt: Date;
  settings: SystemSettingsValues;
}): void {
  const { requestStartAt, requestEndAt, settings } = params;
  const fieldErrors: FieldErrors = {};

  if (requestEndAt.getTime() <= requestStartAt.getTime()) {
    (fieldErrors.requestEndAt ??= []).push('운행 종료 예정 시간은 시작 예정 시간보다 늦어야 합니다.');
  }

  if (!isTenMinuteAligned(requestStartAt, settings.appTimeZone)) {
    (fieldErrors.requestStartAt ??= []).push('운행 시작 시간은 10분 단위로 선택해 주세요.');
  }
  if (!isTenMinuteAligned(requestEndAt, settings.appTimeZone)) {
    (fieldErrors.requestEndAt ??= []).push('운행 종료 시간은 10분 단위로 선택해 주세요.');
  }

  if (!fieldErrors.requestStartAt && !fieldErrors.requestEndAt) {
    const hoursError = checkCompanyVehicleOperatingHours(
      requestStartAt,
      requestEndAt,
      settings.companyVehicleOperatingStartTime,
      settings.companyVehicleOperatingEndTime,
      settings.appTimeZone,
    );
    if (hoursError) (fieldErrors.requestStartAt ??= []).push(hoursError);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('운행 요청 시간을 다시 확인해 주세요.', fieldErrors);
  }
}
