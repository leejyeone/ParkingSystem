import { z } from 'zod';

import {
  emailSchema,
  requiredText,
  USER_PASSWORD_MIN_LENGTH,
  USER_PASSWORD_POLICY_MESSAGE,
  vehicleNoSchema,
} from '@/lib/validation/common';

/** 일반 사용자(회원) 인증 및 프로필 입력 스키마 */

/** 차량번호는 선택 입력이다. 비우면 자동완성에서 제외된다. */
const optionalVehicleNoSchema = z
  .union([z.literal(''), vehicleNoSchema])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
  name: requiredText(50, '성명'),
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 지사명'),
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
  companyOrBranchName: requiredText(100, '방문 상호 또는 소속 지사명'),
  vehicleNo: optionalVehicleNoSchema,
  /** 값이 있을 때만 비밀번호를 변경한다. */
  password: z
    .string()
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.')
    .optional(),
});

export const reservationLookupSchema = z.object({
  reservationNo: z
    .string({ error: '예약번호를 입력해 주세요.' })
    .trim()
    .min(1, '예약번호를 입력해 주세요.')
    .max(30, '예약번호 형식이 올바르지 않습니다.'),
});
