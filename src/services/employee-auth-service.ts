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
 * 실제로 넘겨주는 사번(또는 개발용 진입 폼에 직접 입력한 사번)을 그대로 대조한다.
 *
 * 방문객 회원(SiteUser) 인증과 완전히 별도의 테이블·로직이다. `/employee` 는
 * 로그인이 필수라 비로그인 직원 신청 자체가 존재하지 않으므로, 회원 인증에 있는
 * "비로그인 신청을 로그인 계정에 연결" 로직은 여기에는 없다.
 */

export type EmployeeProfile = {
  employeeUserId: number;
  employeeCode: string;
  email: string;
  name: string;
  departmentName: string;
  vehicleNo: string | null;
};

/** 사번으로 진입. 그룹웨어가 넘겨준 사번(또는 개발용 진입 폼에 직접 입력한 사번)을 그대로 받는다. */
export async function enterByEmployeeCode(employeeCode: string): Promise<EmployeeSession> {
  const employee = await prisma.employeeUser.findFirst({
    where: {
      employeeCode: employeeCode.trim(),
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
    employeeCode: employee.employeeCode,
    email: employee.email,
    name: employee.name,
  };
}

/**
 * 개발 편의용: 이메일로 진입(사번 대신). 그룹웨어 연동 전, 로컬 개발 중에는 사번보다
 * 이메일이 기억하기 쉬워서 `/employee/login` 개발용 진입 화면에서만 이 경로를 쓴다.
 * 운영 계약(`GET /api/employee/enter?empId=사번`)과는 별개의 보조 경로이며, 실제
 * 그룹웨어 연동 시에도 이 함수를 되돌릴 필요는 없다(그냥 안 쓰게 될 뿐).
 */
export async function enterByEmail(email: string): Promise<EmployeeSession> {
  const employee = await prisma.employeeUser.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
    },
    select: { employeeUserId: true, employeeCode: true, email: true, name: true },
  });

  if (!employee) {
    throw new NotFoundError('등록되지 않은 이메일입니다. 관리자에게 문의해 주세요.');
  }

  await prisma.employeeUser.update({
    where: { employeeUserId: employee.employeeUserId },
    data: { lastLoginAt: new Date() },
  });

  return {
    employeeUserId: employee.employeeUserId,
    employeeCode: employee.employeeCode,
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
    employeeCode: employee.employeeCode,
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
    },
  });
}

export type UpdateEmployeeProfileInput = {
  vehicleNo?: string | null;
};

/**
 * 직원 자기 정보 수정. 이름/이메일/부서는 명부(그룹웨어/시드 스크립트)로만 갱신되므로
 * 여기서 다루지 않는다 — 직원이 직접 바꿀 수 있는 건 차량번호뿐이다.
 */
export async function updateEmployeeProfile(
  employeeUserId: number,
  input: UpdateEmployeeProfileInput,
): Promise<EmployeeProfile> {
  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  return prisma.employeeUser.update({
    where: { employeeUserId },
    data: { vehicleNo: vehicleNo || null },
    select: {
      employeeUserId: true,
      employeeCode: true,
      email: true,
      name: true,
      departmentName: true,
      vehicleNo: true,
    },
  });
}
