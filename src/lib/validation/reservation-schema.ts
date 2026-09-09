import { z } from 'zod';

import {
  emailSchema,
  optionalText,
  requiredText,
  vehicleNoSchema,
  zonedDateTimeSchema,
} from '@/lib/validation/common';

/** 예약 API 입력 스키마 (모두 로그인 필수) */

/** 당사 담당자(직원) 매핑. 검색해서 선택한 직원 계정 ID여야 한다. */
const hostEmployeeUserIdSchema = z.coerce.number().int().positive('당사 담당자를 선택해 주세요.');

/** 방문객 본인 신청 (로그인 필수). requesterType 은 항상 서버가 VISITOR 로 강제한다. */
export const createReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '회사명'),
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

/**
 * 직원 본인 방문 신청 (로그인 필수). requesterType=EMPLOYEE 고정, 동의 카드 없음.
 * 소속 사업장명은 직원 명부에 없는 값이라 마이페이지에서 자동완성되지 않으면 직접 입력해야
 * 하며, 입력한 값은 예약 생성 시 마이페이지에도 반영되어 다음 신청부터 자동완성된다.
 */
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
  companyOrBranchName: requiredText(100, '회사명'),
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
  companyOrBranchName: requiredText(100, '회사명'),
  requesterName: requiredText(50, '성명'),
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  /**
   * 당사 담당자(직원 DB 검색·선택). VISITOR 예약에만 의미가 있으며, 신청 시 항상 필수였던
   * 값이라 자기수정으로 지울 수는 없다(null 불허) — 필드 자체를 안 보내면 기존 값 유지.
   */
  hostEmployeeUserId: hostEmployeeUserIdSchema.optional(),
});

export type UpdateReservationPayload = z.infer<typeof updateReservationSchema>;

/**
 * 관리자 전용 수정 스키마. 신청자 본인 수정에는 없는 "당사 담당자" 재지정을 추가로 허용한다.
 * VISITOR 예약에만 의미가 있다 — EMPLOYEE 예약은 본인=담당자라 서비스 레이어에서 무시한다.
 * null 이면 담당자 없음으로 지운다. 필드 자체를 안 보내면(undefined) 기존 값을 그대로 둔다.
 */
export const adminUpdateReservationSchema = updateReservationSchema.extend({
  employeeUserId: z.coerce.number().int().positive().nullable().optional(),
});

export const cancelReservationSchema = z.object({
  cancelReason: requiredText(500, '취소 사유'),
});
