import { z } from 'zod';

import {
  emailSchema,
  optionalText,
  requiredText,
  vehicleNoSchema,
  zonedDateTimeSchema,
} from '@/lib/validation/common';

/** 예약 API 입력 스키마 (로그인 여부와 무관하게 동일하다) */

/** 당사 담당자(직원) 매핑. 검색해서 선택한 직원 계정 ID여야 한다. */
const hostEmployeeUserIdSchema = z.coerce.number().int().positive('당사 담당자를 선택해 주세요.');

/** 방문객 본인 신청 (공개, 로그인 선택). requesterType 은 항상 서버가 VISITOR 로 강제한다. */
export const createReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 사업장명'),
  requesterName: requiredText(50, '성명'),
  requesterEmail: emailSchema,
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  /** 당사 담당자(직원 DB 검색·선택). 방문객 본인 신청도 반드시 매핑해야 한다. */
  hostEmployeeUserId: hostEmployeeUserIdSchema,
  privacyConsent: z
    .boolean({ error: '개인정보 수집 및 이용에 동의해 주세요.' })
    .refine((value) => value === true, '개인정보 수집 및 이용에 동의해 주세요.'),
});

export type CreateReservationPayload = z.infer<typeof createReservationSchema>;

/** 직원 본인 방문 신청 (로그인 필수). requesterType=EMPLOYEE 고정, 동의 카드 없음. */
export const createEmployeeReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '소속 사업장명'),
  requesterName: requiredText(50, '성명'),
  requesterEmail: emailSchema,
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
});

export type CreateEmployeeReservationPayload = z.infer<typeof createEmployeeReservationSchema>;

/** 직원의 방문객 대리 신청 (로그인 필수). requesterType=VISITOR 고정, employeeUserId=담당 직원. */
export const createEmployeeProxyReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '방문상호'),
  requesterName: requiredText(50, '성명'),
  requesterEmail: emailSchema,
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  /**
   * 당사 담당자(직원 DB 검색·선택). 기본값은 대리 신청 중인 로그인 직원 본인이지만,
   * 실제 방문객을 담당하는 다른 직원으로 바꿀 수 있다.
   */
  hostEmployeeUserId: hostEmployeeUserIdSchema,
  visitorConsentConfirmed: z
    .boolean({ error: '방문객 개인정보 수집·이용 동의 확인이 필요합니다.' })
    .refine((value) => value === true, '방문객 개인정보 수집·이용 동의 확인이 필요합니다.'),
});

export type CreateEmployeeProxyReservationPayload = z.infer<
  typeof createEmployeeProxyReservationSchema
>;

/**
 * 신청자 수정 스키마.
 * 이메일은 본인 확인의 기준이자 토큰 발송지이므로 수정 대상에서 제외한다.
 * (변경이 필요하면 취소 후 재신청하도록 안내한다)
 */
export const updateReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 사업장명'),
  requesterName: requiredText(50, '성명'),
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
});

export type UpdateReservationPayload = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  cancelReason: requiredText(500, '취소 사유'),
});
