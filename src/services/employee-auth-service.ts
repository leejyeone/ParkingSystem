import { AccountStatus } from '@prisma/client';

import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import { getEmployeeSession, type EmployeeSession } from '@/lib/employee-session';
import { prisma } from '@/lib/prisma';
import { normalizeVehicleNo } from '@/lib/vehicle';

/**
 * 직원 인증 서비스.
 *
 * 비밀번호가 없다 — 사번(employeeCode)만으로 진입한다. 전 직원 명부는
 * scripts/import-employees.ts 로 미리 employee_users 에 심어 두고, 그룹웨어가
 * 실제로 넘겨주는 사번을 그대로 대조한다.
 *
 * 방문객 회원(SiteUser) 인증과 완전히 별도의 테이블·로직이다. `/employee` 는
 * 로그인이 필수라 비로그인 직원 신청 자체가 존재하지 않으므로, 회원 인증에 있는
 * "비로그인 신청을 로그인 계정에 연결" 로직은 여기에는 없다.
 */

export type EmployeeProfile = {
  employeeUserId: number;
  /** 사번이 확정되지 않은 직원이 있어 비어 있을 수 있다. 화면에서는 '-' 로 표시한다. */
  employeeCode: string | null;
  email: string;
  name: string;
  departmentName: string;
  vehicleNo: string | null;
  companyOrBranchName: string | null;
};

/**
 * 사번으로 진입. 그룹웨어가 넘겨준 사번(또는 개발용 진입 폼에 직접 입력한 사번)을 그대로 받는다.
 *
 * 사번은 그룹웨어에서 유일하지 않아(비어 있거나 두 사람이 공유하는 경우가 있다) 확정할 수 없는
 * 사번은 명부에 아예 넣지 않는다. 그런 직원은 사번이 확정될 때까지 이 시스템에 로그인할 수 없다.
 * 빈 값이 NULL 행과 엮이지 않도록 여기서 한 번 더 막는다.
 */
export async function enterByEmployeeCode(employeeCode: string): Promise<EmployeeSession> {
  const trimmed = employeeCode.trim();
  if (!trimmed) {
    throw new NotFoundError('등록되지 않은 사번입니다. 관리자에게 문의해 주세요.');
  }

  const employee = await prisma.employeeUser.findFirst({
    where: {
      employeeCode: trimmed,
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
    },
    select: { employeeUserId: true, employeeCode: true, email: true, name: true },
  });

  if (!employee) {
    throw new NotFoundError('등록되지 않은 사번입니다. 관리자에게 문의해 주세요.');
  }

  await prisma.employeeUser.update({
    where: { employeeUserId: employee.employeeUserId },
    data: { lastLoginAt: new Date() },
  });

  return {
    employeeUserId: employee.employeeUserId,
    employeeCode: employee.employeeCode ?? '',
    email: employee.email,
    name: employee.name,
  };
}

/**
 * 현재 요청의 직원 세션을 확인하고 DB 에서 계정이 여전히 유효한지 재검증한다.
 * (세션 발급 이후 비활성화된 계정이 계속 접근하는 것을 막는다)
 */
export async function requireActiveEmployee(): Promise<EmployeeSession> {
  const session = await getEmployeeSession();
  if (!session) {
    throw new UnauthorizedError('로그인이 필요합니다.');
  }

  const employee = await prisma.employeeUser.findFirst({
    where: { employeeUserId: session.employeeUserId, deletedAt: null },
    select: {
      employeeUserId: true,
      employeeCode: true,
      email: true,
      name: true,
      accountStatus: true,
    },
  });

  if (!employee || employee.accountStatus !== AccountStatus.ACTIVE) {
    throw new UnauthorizedError(
      '세션이 만료되었거나 사용할 수 없는 계정입니다. 다시 로그인해 주세요.',
    );
  }

  return {
    employeeUserId: employee.employeeUserId,
    employeeCode: employee.employeeCode ?? '',
    email: employee.email,
    name: employee.name,
  };
}

/** 신청 폼 자동완성에 사용할 직원 정보 */
export async function getEmployeeProfile(employeeUserId: number): Promise<EmployeeProfile | null> {
  return prisma.employeeUser.findFirst({
    where: { employeeUserId, deletedAt: null, accountStatus: AccountStatus.ACTIVE },
    select: {
      employeeUserId: true,
      employeeCode: true,
      email: true,
      name: true,
      departmentName: true,
      vehicleNo: true,
      companyOrBranchName: true,
    },
  });
}

export type UpdateEmployeeProfileInput = {
  vehicleNo?: string | null;
  companyOrBranchName?: string | null;
};

/**
 * 직원 자기 정보 수정. 이름/이메일/부서는 명부(그룹웨어/시드 스크립트)로만 갱신되므로
 * 여기서 다루지 않는다 — 직원이 직접 바꿀 수 있는 건 차량번호·소속 사업장명뿐이다.
 */
export async function updateEmployeeProfile(
  employeeUserId: number,
  input: UpdateEmployeeProfileInput,
): Promise<EmployeeProfile> {
  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  return prisma.employeeUser.update({
    where: { employeeUserId },
    data: {
      vehicleNo: vehicleNo || null,
      companyOrBranchName: input.companyOrBranchName?.trim() || null,
    },
    select: {
      employeeUserId: true,
      employeeCode: true,
      email: true,
      name: true,
      departmentName: true,
      vehicleNo: true,
      companyOrBranchName: true,
    },
  });
}
