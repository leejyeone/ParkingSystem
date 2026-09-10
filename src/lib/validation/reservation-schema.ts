import { z } from 'zod';

import {
  emailSchema,
  optionalText,
  requiredText,
  vehicleNoSchema,
  zonedDateTimeSchema,
} from '@/lib/validation/common';

/** 예약 API 입력 스키마 (모두 로그인 필수) */

/**
 * 방문객 본인 신청 (로그인 필수). requesterType 은 항상 서버가 VISITOR 로 강제한다.
 * 회사명/성명/이메일/차량번호/당사 담당자는 회원가입 때 확정한 회원 프로필 값을 서버가
 * 직접 읽어 채운다 — 화면에서도 수정할 수 없으므로 클라이언트에서 받지 않는다.
 */
export const createReservationSchema = z.object({
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
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

/**
 * 직원의 방문객 대리 신청 (로그인 필수). requesterType=VISITOR 고정.
 * 당사 담당자는 항상 대리 신청 중인 로그인 직원 본인으로 서버가 고정한다(화면에서도
 * 수정할 수 없으므로 클라이언트에서 받지 않는다).
 */
export const createEmployeeProxyReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '회사명'),
  requesterName: requiredText(50, '성명'),
  requesterEmail: emailSchema,
  vehicleNo: vehicleNoSchema,
  visitPurpose: optionalText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
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
});

export type UpdateReservationPayload = z.infer<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  cancelReason: requiredText(500, '취소 사유'),
});
