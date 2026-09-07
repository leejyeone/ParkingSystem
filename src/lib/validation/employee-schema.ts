import { AccountStatus } from '@prisma/client';
import { z } from 'zod';

import {
  emailSchema,
  optionalText,
  optionalVehicleNoSchema,
  requiredText,
} from '@/lib/validation/common';

/** 사번으로 진입(비밀번호 없음). 그룹웨어 링크의 실제 착지점이 쓰는 운영 계약이다. */
export const employeeCodeEntrySchema = z.object({
  employeeCode: requiredText(20, '사번'),
});

/** 개발 편의용: 이메일로 진입. `/employee/login` 개발용 진입 폼만 이 경로를 쓴다. */
export const employeeEmailEntrySchema = z.object({
  email: emailSchema,
});

/**
 * 직원 자기 정보 수정. 이름/이메일/부서는 명부로만 갱신되므로 차량번호·소속 사업장명만
 * 받는다 — 둘 다 명부에 없는 값이라 직원이 직접 채워야 신청 폼 자동완성에 쓸 수 있다.
 */
export const employeeProfileUpdateSchema = z.object({
  vehicleNo: optionalVehicleNoSchema,
  companyOrBranchName: optionalText(100, '소속 사업장명'),
});

/** 관리자가 직원 계정을 직접 생성할 때의 입력. 자동 로그인(사번 대조)에 필요한 필드는 전부 필수. */
export const employeeUserCreateSchema = z.object({
  employeeCode: requiredText(20, '사번'),
  email: emailSchema,
  name: requiredText(50, '이름'),
  departmentName: requiredText(100, '부서명'),
  vehicleNo: optionalVehicleNoSchema,
  companyOrBranchName: optionalText(100, '소속 사업장명'),
});

/** 관리자용 직원 계정 관리 입력 스키마. */

export const employeeUserUpdateSchema = z.object({
  accountStatus: z.enum(AccountStatus).refine((value) => value !== AccountStatus.LOCKED, {
    error: '활성 또는 비활성만 선택할 수 있습니다.',
  }),
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

/** 예약 신청 화면의 "당사 담당자" 검색(공개). 방문객도 사용하므로 로그인 여부와 무관하다. */
export const employeeSearchSchema = z.object({
  query: z.string().trim().min(2, '검색어는 2자 이상 입력해 주세요.').max(100, '검색어가 너무 깁니다.'),
});
