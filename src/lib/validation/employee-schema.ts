import { AccountStatus } from '@prisma/client';
import { z } from 'zod';

import {
  emailSchema,
  optionalText,
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
  department: optionalText(100, '부서'),
  vehicleNo: optionalVehicleNoSchema,
});

/** 첫 로그인 강제 비밀번호 변경. 이름·소속 없이 비밀번호만 받는다. */
export const employeeChangePasswordSchema = z.object({
  password: z
    .string({ error: '새 비밀번호를 입력해 주세요.' })
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
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
  department: optionalText(100, '부서'),
  vehicleNo: optionalVehicleNoSchema,
  /** 값이 있을 때만 비밀번호를 변경한다. */
  password: z
    .string()
    .min(USER_PASSWORD_MIN_LENGTH, USER_PASSWORD_POLICY_MESSAGE)
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.')
    .optional(),
});

/** 관리자용 직원 계정 관리 입력 스키마 */

export const employeeUserCreateSchema = z.object({
  email: emailSchema,
  name: requiredText(50, '성명'),
  branchName: requiredText(100, '소속 사업장명'),
  department: optionalText(100, '부서'),
});

export const employeeUserUpdateSchema = z.object({
  name: requiredText(50, '성명').optional(),
  branchName: requiredText(100, '소속 사업장명').optional(),
  /** 값이 없으면 건드리지 않는다(부분 수정). 빈 문자열이면 비운다. */
  department: z.string().trim().max(100, '부서는 100자 이하로 입력해 주세요.').optional(),
  accountStatus: z.enum(AccountStatus).optional(),
});

/** 관리자가 여러 직원 계정을 한 번에 활성화/비활성화한다. */
export const employeeUserBulkStatusSchema = z.object({
  employeeUserIds: z
    .array(z.coerce.number().int().positive())
    .min(1, '계정을 하나 이상 선택해 주세요.')
    .max(200, '한 번에 최대 200건까지 처리할 수 있습니다.'),
  accountStatus: z
    .enum(AccountStatus)
    .refine((value) => value !== AccountStatus.LOCKED, '활성 또는 비활성만 선택할 수 있습니다.'),
});
