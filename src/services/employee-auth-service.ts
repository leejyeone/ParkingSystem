import { AccountStatus, Prisma } from '@prisma/client';

import {
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isUserPasswordPolicySatisfied,
  verifyPassword,
} from '@/lib/password';
import { getEmployeeSession, type EmployeeSession } from '@/lib/employee-session';
import { prisma } from '@/lib/prisma';
import { USER_PASSWORD_POLICY_MESSAGE } from '@/lib/validation/common';
import { normalizeVehicleNo } from '@/lib/vehicle';

/**
 * 직원 인증 서비스.
 *
 * 방문객 회원(SiteUser) 인증과 완전히 별도의 테이블·로직이다. `/employee` 는
 * 로그인이 필수라 비로그인 직원 신청 자체가 존재하지 않으므로, 회원 인증에 있는
 * "비로그인 신청을 로그인 계정에 연결" 로직은 여기에는 없다.
 *
 * brute-force 방지 (관리자/회원과 동일한 정책)
 *  - 연속 로그인 실패 5회 시 계정을 LOCKED 로 전환하고 10분간 잠근다.
 *  - 존재하지 않는 이메일도 더미 해시로 비교해 응답 시간 차이를 없앤다.
 */

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_DURATION_MINUTES = 10;

const INVALID_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';

export type EmployeeProfile = {
  employeeUserId: number;
  email: string;
  name: string;
  branchName: string;
  vehicleNo: string | null;
};

export type SignUpEmployeeInput = {
  email: string;
  password: string;
  name: string;
  branchName: string;
  vehicleNo?: string | null;
};

export async function signUpEmployee(input: SignUpEmployeeInput): Promise<EmployeeSession> {
  if (!isUserPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(USER_PASSWORD_POLICY_MESSAGE, {
      password: [USER_PASSWORD_POLICY_MESSAGE],
    });
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  try {
    const created = await prisma.employeeUser.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        name,
        branchName: input.branchName.trim(),
        vehicleNo: vehicleNo || null,
        accountStatus: AccountStatus.ACTIVE,
        passwordChangedAt: new Date(),
      },
      select: { employeeUserId: true, email: true, name: true },
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        '이미 가입된 이메일입니다. 로그인해 주세요.',
        'DUPLICATE_EMPLOYEE_EMAIL',
      );
    }
    throw error;
  }
}

export async function loginEmployee(params: {
  email: string;
  password: string;
}): Promise<EmployeeSession> {
  const email = params.email.trim().toLowerCase();

  const employee = await prisma.employeeUser.findFirst({
    where: { email, deletedAt: null },
    select: {
      employeeUserId: true,
      email: true,
      name: true,
      passwordHash: true,
      accountStatus: true,
      loginFailCount: true,
      lockedUntil: true,
    },
  });

  if (!employee) {
    // 타이밍 공격 방지를 위해 존재하지 않는 계정도 동일한 비용으로 비교한다.
    await verifyPassword(params.password, DUMMY_PASSWORD_HASH);
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  if (employee.accountStatus === AccountStatus.INACTIVE) {
    throw new ForbiddenError('사용할 수 없는 계정입니다. 관리자에게 문의해 주세요.');
  }

  const now = new Date();
  const isLocked =
    employee.accountStatus === AccountStatus.LOCKED &&
    employee.lockedUntil !== null &&
    employee.lockedUntil.getTime() > now.getTime();

  if (isLocked) {
    throw new TooManyRequestsError(
      `로그인 실패가 반복되어 계정이 일시 잠금되었습니다. ${LOCK_DURATION_MINUTES}분 후 다시 시도해 주세요.`,
    );
  }

  const passwordMatched = await verifyPassword(params.password, employee.passwordHash);

  if (!passwordMatched) {
    const nextFailCount = employee.loginFailCount + 1;
    const shouldLock = nextFailCount >= MAX_LOGIN_FAILURES;

    await prisma.employeeUser.update({
      where: { employeeUserId: employee.employeeUserId },
      data: {
        loginFailCount: nextFailCount,
        accountStatus: shouldLock ? AccountStatus.LOCKED : employee.accountStatus,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + LOCK_DURATION_MINUTES * 60_000)
          : employee.lockedUntil,
      },
    });

    if (shouldLock) {
      throw new TooManyRequestsError(
        `로그인 실패가 ${MAX_LOGIN_FAILURES}회 누적되어 계정이 ${LOCK_DURATION_MINUTES}분간 잠금되었습니다.`,
      );
    }
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  await prisma.employeeUser.update({
    where: { employeeUserId: employee.employeeUserId },
    data: {
      loginFailCount: 0,
      lockedUntil: null,
      accountStatus: AccountStatus.ACTIVE,
      lastLoginAt: now,
    },
  });

  return { employeeUserId: employee.employeeUserId, email: employee.email, name: employee.name };
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
    select: { employeeUserId: true, email: true, name: true, accountStatus: true },
  });

  if (!employee || employee.accountStatus !== AccountStatus.ACTIVE) {
    throw new UnauthorizedError(
      '세션이 만료되었거나 사용할 수 없는 계정입니다. 다시 로그인해 주세요.',
    );
  }

  return { employeeUserId: employee.employeeUserId, email: employee.email, name: employee.name };
}

/** 신청 폼 자동완성에 사용할 직원 정보 */
export async function getEmployeeProfile(employeeUserId: number): Promise<EmployeeProfile | null> {
  return prisma.employeeUser.findFirst({
    where: { employeeUserId, deletedAt: null, accountStatus: AccountStatus.ACTIVE },
    select: {
      employeeUserId: true,
      email: true,
      name: true,
      branchName: true,
      vehicleNo: true,
    },
  });
}

export type UpdateEmployeeProfileInput = {
  name: string;
  branchName: string;
  vehicleNo?: string | null;
  /** 값이 있으면 비밀번호를 변경한다. */
  password?: string;
};

export async function updateEmployeeProfile(
  employeeUserId: number,
  input: UpdateEmployeeProfileInput,
): Promise<EmployeeProfile> {
  if (input.password !== undefined && !isUserPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(USER_PASSWORD_POLICY_MESSAGE, {
      password: [USER_PASSWORD_POLICY_MESSAGE],
    });
  }

  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  return prisma.employeeUser.update({
    where: { employeeUserId },
    data: {
      name: input.name.trim(),
      branchName: input.branchName.trim(),
      vehicleNo: vehicleNo || null,
      ...(input.password !== undefined
        ? {
            passwordHash: await hashPassword(input.password),
            passwordChangedAt: new Date(),
            loginFailCount: 0,
            lockedUntil: null,
          }
        : {}),
    },
    select: {
      employeeUserId: true,
      email: true,
      name: true,
      branchName: true,
      vehicleNo: true,
    },
  });
}
