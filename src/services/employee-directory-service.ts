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
  branchName: string;
  department: string | null;
};

const SEARCH_RESULT_LIMIT = 20;

export async function searchActiveEmployees(query: string): Promise<EmployeeDirectoryEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.employeeUser.findMany({
    where: {
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
      OR: [
        { name: { contains: trimmed } },
        { department: { contains: trimmed } },
        { branchName: { contains: trimmed } },
      ],
    },
    select: { employeeUserId: true, name: true, branchName: true, department: true },
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
