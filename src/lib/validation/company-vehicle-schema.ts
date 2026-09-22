import { z } from 'zod';

import { requiredText, zonedDateTimeSchema } from '@/lib/validation/common';

/**
 * 법인 공용 차량 운행 신청 (로그인 직원 필수).
 * 신청자(운행 예정자)는 항상 서버가 로그인 세션의 직원 본인으로 고정한다 — 화면에서도
 * 수정할 수 없으므로 클라이언트에서 받지 않는다. 어떤 차량을 쓸지는 직원이 신청 시점에
 * 직접 고른다 — 관리자는 승인/반려만 한다.
 */
export const createCompanyVehicleTripSchema = z.object({
  destination: requiredText(200, '행선지'),
  reason: requiredText(500, '사유'),
  requestStartAt: zonedDateTimeSchema,
  requestEndAt: zonedDateTimeSchema,
  vehicleId: z.coerce.number().int().positive('사용할 차량을 선택해 주세요.'),
});

/** 신청자 본인 취소 (승인 대기 상태에서만 허용 — 서비스 계층에서 확인). */
export const cancelCompanyVehicleTripSchema = z.object({
  cancelReason: requiredText(500, '취소 사유'),
});

/**
 * 신청자 본인 "반납 처리" — 실제 반납한 시각을 직접 고른다. 버튼을 누른 시각이 아니라
 * 실제로 차를 반납한 시각을 남길 수 있게 하기 위함(관리자 입/출차 시각 입력과 같은 이유).
 * 값이 없으면 서비스 계층에서 지금 시각으로 처리한다(기존 동작과 호환).
 */
export const requestCompanyVehicleReturnSchema = z.object({
  actualEntryAt: zonedDateTimeSchema.optional(),
});

/** 빈 문자열/undefined 는 null 로, 그 외는 숫자로 강제 변환한다(선택 입력 숫자 필드용). */
const optionalNonNegativeInt = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(0, '0 이상이어야 합니다.').nullable(),
);

/**
 * 주행거리(계기판) 신청 직원 본인 입력 — 예약일 당일부터 반납 처리 전까지 몇 번이든
 * 저장할 수 있다(서비스 계층에서 시점을 검증한다). 관리자용 스키마와 모양은 같지만,
 * 직원 화면 코드가 관리자 스키마에 의존하지 않도록 별도로 둔다.
 */
export const employeeCompanyVehicleTripMileageSchema = z
  .object({
    odometerStartKm: optionalNonNegativeInt,
    odometerEndKm: optionalNonNegativeInt,
    manualDistanceKm: optionalNonNegativeInt,
  })
  .refine(
    (value) =>
      value.odometerStartKm === null ||
      value.odometerEndKm === null ||
      value.odometerEndKm >= value.odometerStartKm,
    {
      message: '도착 후 계기판 거리는 출발 전 계기판 거리보다 크거나 같아야 합니다.',
      path: ['odometerEndKm'],
    },
  );

