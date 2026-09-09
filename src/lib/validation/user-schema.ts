import { AccountStatus } from '@prisma/client';
import { z } from 'zod';

import {
  emailSchema,
  optionalVehicleNoSchema,
  requiredText,
  USER_PASSWORD_MIN_LENGTH,
  USER_PASSWORD_POLICY_MESSAGE,
  vehicleNoSchema,
} from '@/lib/validation/common';

/** 일반 사용자(회원) 인증 및 프로필 입력 스키마 */

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
  name: requiredText(50, '성명'),
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 사업장명'),
  vehicleNo: optionalVehicleNoSchema,
});

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(1, '비밀번호를 입력해 주세요.')
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
});

export const userProfileUpdateSchema = z.object({
  name: requiredText(50, '성명'),
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 사업장명'),
  vehicleNo: optionalVehicleNoSchema,
  /** 값이 있을 때만 비밀번호를 변경한다. */
  password: z
    .string()
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.')
    .optional(),
});

export const deleteAccountSchema = z.object({
  password: z.string({ error: '비밀번호를 입력해 주세요.' }).min(1, '비밀번호를 입력해 주세요.'),
});

/** 관리자용 회원 계정 관리 입력 스키마. */
export const siteUserUpdateStatusSchema = z.object({
  accountStatus: z.enum(AccountStatus).refine((value) => value !== AccountStatus.LOCKED, {
    error: '활성 또는 비활성만 선택할 수 있습니다.',
  }),
});

/** 일괄 활성화/비활성화 한 요청에 담을 수 있는 최대 건수. 클라이언트도 이 값 단위로 나눠 보낸다. */
export const SITE_USER_BULK_STATUS_MAX = 200;

export const siteUserBulkStatusSchema = z.object({
  userIds: z
    .array(z.coerce.number().int().positive())
    .min(1, '계정을 하나 이상 선택해 주세요.')
    .max(
      SITE_USER_BULK_STATUS_MAX,
      `한 번에 최대 ${SITE_USER_BULK_STATUS_MAX}건까지 처리할 수 있습니다.`,
    ),
  accountStatus: z
    .enum(AccountStatus)
    .refine((value) => value !== AccountStatus.LOCKED, '활성 또는 비활성만 선택할 수 있습니다.'),
});

export const reservationLookupSchema = z.object({
  requesterName: requiredText(50, '성명'),
  vehicleNo: vehicleNoSchema,
});

export const reservationLookupAccessSchema = z.object({
  reservationId: z.coerce.number().int().positive('예약을 다시 선택해 주세요.'),
  requesterName: requiredText(50, '성명'),
  vehicleNo: vehicleNoSchema,
});
