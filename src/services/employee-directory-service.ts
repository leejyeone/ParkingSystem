import { AccountStatus } from '@prisma/client';

import { ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

/**
 * 예약 신청 화면에서 "당사 담당자"를 검색·선택하기 위한 공개 조회.
 *
 * 방문객 본인 신청(비로그인 가능)에서도 써야 하므로 인증 없이 호출된다. 그래서
 * 응답에는 이름·소속·부서만 담고 이메일 등 그 외 개인정보는 포함하지 않는다.
 */
export type EmployeeDirectoryEntry = {
  employeeUserId: number;
  name: string;
  departmentName: string;
};

const SEARCH_RESULT_LIMIT = 20;

export async function searchActiveEmployees(query: string): Promise<EmployeeDirectoryEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.employeeUser.findMany({
    where: {
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
      OR: [{ name: { contains: trimmed } }, { departmentName: { contains: trimmed } }],
    },
    select: { employeeUserId: true, name: true, departmentName: true },
    orderBy: [{ name: 'asc' }],
    take: SEARCH_RESULT_LIMIT,
  });
}

/** 예약 생성 시 선택된 "당사 담당자"가 실존하는 활성 직원인지 검증한다. */
export async function assertActiveEmployeeExists(employeeUserId: number): Promise<void> {
  const employee = await prisma.employeeUser.findFirst({
    where: { employeeUserId, deletedAt: null, accountStatus: AccountStatus.ACTIVE },
    select: { employeeUserId: true },
  });
  if (!employee) {
    throw new ValidationError('당사 담당자를 찾을 수 없습니다. 다시 선택해 주세요.', {
      hostEmployeeUserId: ['당사 담당자를 찾을 수 없습니다. 다시 선택해 주세요.'],
    });
  }
}

export type VerifiedHostEmployee = {
  employeeUserId: number;
  name: string;
  departmentName: string;
};

/** 전화번호에서 숫자만 남긴다. import-employees.ts 의 저장 방식과 맞춰야 비교가 된다. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * 회원가입/마이페이지의 "당사 담당자" 확인 — 이름+전화번호가 모두 정확히 일치하는
 * 딱 한 명만 확정한다. 명부 목록을 노출하지 않기 위해 검색이 아니라 단건 검증만 제공한다.
 * 이름/전화 중 무엇이 틀렸는지는 구분하지 않는다(대입 공격 방지) — 실패하면 항상 null.
 */
export async function verifyHostEmployee(
  name: string,
  phone: string,
): Promise<VerifiedHostEmployee | null> {
  const trimmedName = name.trim();
  const normalizedPhone = digitsOnly(phone);
  if (!trimmedName || !normalizedPhone) return null;

  const employee = await prisma.employeeUser.findFirst({
    where: {
      name: trimmedName,
      phone: normalizedPhone,
      accountStatus: AccountStatus.ACTIVE,
      deletedAt: null,
    },
    select: { employeeUserId: true, name: true, departmentName: true },
  });

  return employee;
}
