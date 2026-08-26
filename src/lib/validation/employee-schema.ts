import { z } from 'zod';

import {
  emailSchema,
  optionalVehicleNoSchema,
  requiredText,
  USER_PASSWORD_MIN_LENGTH,
  USER_PASSWORD_POLICY_MESSAGE,
} from '@/lib/validation/common';

/** 직원 인증 입력 스키마 */

export const employeeSignUpSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
  name: requiredText(50, '성명'),
  branchName: requiredText(100, '소속 사업장명'),
  vehicleNo: optionalVehicleNoSchema,
});

export const employeeLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(1, '비밀번호를 입력해 주세요.')
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
});

export const employeeProfileUpdateSchema = z.object({
  name: requiredText(50, '성명'),
  branchName: requiredText(100, '소속 사업장명'),
  vehicleNo: optionalVehicleNoSchema,
  /** 값이 있을 때만 비밀번호를 변경한다. */
  password: z
    .string()
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.')
    .optional(),
});
