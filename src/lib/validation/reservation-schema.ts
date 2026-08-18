import { RequesterType } from '@prisma/client';
import { z } from 'zod';

import {
  emailSchema,
  optionalText,
  requiredText,
  vehicleNoSchema,
  zonedDateTimeSchema,
} from '@/lib/validation/common';

/** 예약 API 입력 스키마 (로그인 여부와 무관하게 동일하다) */

export const requesterTypeSchema = z.enum([RequesterType.VISITOR, RequesterType.EMPLOYEE], {
  error: '신청 구분을 선택해 주세요.',
});

export const createReservationSchema = z.object({
  requesterType: requesterTypeSchema,
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 지사명'),
  requesterName: requiredText(50, '성명'),
  requesterEmail: emailSchema,
  vehicleNo: vehicleNoSchema,
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
 * 신청자 수정 스키마.
 * 이메일은 본인 확인의 기준이자 토큰 발송지이므로 수정 대상에서 제외한다.
 * (변경이 필요하면 취소 후 재신청하도록 안내한다)
 */
export const updateReservationSchema = z.object({
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 지사명'),
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
