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
  visitPurpose: requiredText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  /** 운영시간/최대 이용시간을 벗어난 시간대를 예외로 신청하는 사유. 채워지면 예외 신청. */
  timingExceptionReason: optionalText(300, '예외 신청 사유'),
  privacyConsent: z
    .boolean({ error: '개인정보 수집 및 이용에 동의해 주세요.' })
    .refine((value) => value === true, '개인정보 수집 및 이용에 동의해 주세요.'),
  securityPledgeConsent: z
    .boolean({ error: '보안서약서에 동의해 주세요.' })
    .refine((value) => value === true, '보안서약서에 동의해 주세요.'),
});

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
  visitPurpose: requiredText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  timingExceptionReason: optionalText(300, '예외 신청 사유'),
});

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
  visitPurpose: requiredText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  timingExceptionReason: optionalText(300, '예외 신청 사유'),
  visitorConsentConfirmed: z
    .boolean({ error: '방문객 개인정보 수집·이용 동의 확인이 필요합니다.' })
    .refine((value) => value === true, '방문객 개인정보 수집·이용 동의 확인이 필요합니다.'),
  visitorSecurityPledgeConfirmed: z
    .boolean({ error: '방문객 보안서약서 동의 확인이 필요합니다.' })
    .refine((value) => value === true, '방문객 보안서약서 동의 확인이 필요합니다.'),
});

/**
 * 신청자 수정 스키마.
 * 이메일은 본인 확인의 기준이자 토큰 발송지이므로 수정 대상에서 제외한다.
 * (변경이 필요하면 취소 후 재신청하도록 안내한다)
 */
export const updateReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '회사명'),
  requesterName: requiredText(50, '성명'),
  vehicleNo: vehicleNoSchema,
  visitPurpose: requiredText(200, '방문 목적'),
  requestMemo: optionalText(1000, '요청 메모'),
  visitStartAt: zonedDateTimeSchema,
  visitEndAt: zonedDateTimeSchema,
  timingExceptionReason: optionalText(300, '예외 신청 사유'),
});

export const cancelReservationSchema = z.object({
  cancelReason: requiredText(500, '취소 사유'),
});

/**
 * 관리자 수정 — `updateReservationSchema`와 달리 모든 필드가 선택이다. 관리자 화면이
 * "신청 정보"/"방문 일정" 두 카드로 나뉘어 있어, 카드마다 자기 영역의 필드만 보낸다
 * (안 보낸 필드는 서비스 계층이 지금 DB 값으로 채운다 — `updateReservationByAdmin` 참고).
 */
export const adminUpdateReservationSchema = updateReservationSchema.partial();
