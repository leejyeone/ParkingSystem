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
import { prisma } from '@/lib/prisma';
import { getUserSession, type UserSession } from '@/lib/user-session';
import { USER_PASSWORD_POLICY_MESSAGE } from '@/lib/validation/common';
import { normalizeVehicleNo } from '@/lib/vehicle';

/**
 * 일반 사용자(회원) 인증 서비스.
 *
 * 로그인은 선택 기능이다. 회원 정보는 신청 폼 자동완성과 내 예약 목록에만 사용한다.
 *
 * brute-force 방지 (관리자와 동일한 정책)
 *  - 연속 로그인 실패 5회 시 계정을 LOCKED 로 전환하고 10분간 잠근다.
 *  - 존재하지 않는 이메일도 더미 해시로 비교해 응답 시간 차이를 없앤다.
 *  - 이메일/비밀번호 중 무엇이 틀렸는지 구분해서 알려주지 않는다.
 */

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_DURATION_MINUTES = 10;

const INVALID_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다.';

export type UserProfile = {
  userId: number;
  email: string;
  name: string;
  companyOrBranchName: string;
  vehicleNo: string | null;
};

export type SignUpUserInput = {
  email: string;
  password: string;
  name: string;
  companyOrBranchName: string;
  vehicleNo?: string | null;
};

export type SignUpResult = UserSession & {
  /** 가입 시 이 계정 내역으로 연결된 기존 예약 건수 */
  linkedReservationCount: number;
};

/**
 * 성명·이메일이 일치하는 비로그인 예약을 이 계정 내역으로 연결한다.
 *
 * 가입 시점뿐 아니라 로그인할 때마다 실행한다. 회원이 로그아웃 상태에서 신청하거나
 * 안내 메일 링크로만 처리한 예약이 계정에 영영 붙지 않는 것을 막기 위함이다.
 * 이미 다른 계정에 연결된 예약(visitorUserId != null)은 대상에서 제외한다.
 */
export async function linkReservationsToUser(
  params: { userId: number; email: string; name: string },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const linked = await db.parkingReservation.updateMany({
    where: {
      visitorUserId: null,
      requesterEmail: params.email.trim().toLowerCase(),
      requesterName: params.name.trim(),
    },
    data: { visitorUserId: params.userId },
  });
  return linked.count;
}

export async function signUpUser(input: SignUpUserInput): Promise<SignUpResult> {
  if (!isUserPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(USER_PASSWORD_POLICY_MESSAGE, {
      password: [USER_PASSWORD_POLICY_MESSAGE],
    });
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  try {
    const { created, linkedReservationCount } = await prisma.$transaction(async (tx) => {
      const created = await tx.siteUser.create({
        data: {
          email,
          passwordHash: await hashPassword(input.password),
          name,
          companyOrBranchName: input.companyOrBranchName.trim(),
          vehicleNo: vehicleNo || null,
          accountStatus: AccountStatus.ACTIVE,
          passwordChangedAt: new Date(),
        },
        select: { userId: true, email: true, name: true },
      });

      // 가입 전 비로그인으로 신청했던 예약을 이 계정 내역으로 연결한다.
      const linkedReservationCount = await linkReservationsToUser(
        { userId: created.userId, email, name },
        tx,
      );

      return { created, linkedReservationCount };
    });

    return {
      userId: created.userId,
      email: created.email,
      name: created.name,
      linkedReservationCount,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 가입된 이메일입니다. 로그인해 주세요.', 'DUPLICATE_USER_EMAIL');
    }
    throw error;
  }
}

export async function loginUser(params: { email: string; password: string }): Promise<UserSession> {
  const email = params.email.trim().toLowerCase();

  const user = await prisma.siteUser.findFirst({
    where: { email, deletedAt: null },
    select: {
      userId: true,
      email: true,
      name: true,
      passwordHash: true,
      accountStatus: true,
      loginFailCount: true,
      lockedUntil: true,
    },
  });

  if (!user) {
    // 타이밍 공격 방지를 위해 존재하지 않는 계정도 동일한 비용으로 비교한다.
    await verifyPassword(params.password, DUMMY_PASSWORD_HASH);
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  if (user.accountStatus === AccountStatus.INACTIVE) {
    throw new ForbiddenError('사용할 수 없는 계정입니다. 관리자에게 문의해 주세요.');
  }

  const now = new Date();
  const isLocked =
    user.accountStatus === AccountStatus.LOCKED &&
    user.lockedUntil !== null &&
    user.lockedUntil.getTime() > now.getTime();

  if (isLocked) {
    throw new TooManyRequestsError(
      `로그인 실패가 반복되어 계정이 일시 잠금되었습니다. ${LOCK_DURATION_MINUTES}분 후 다시 시도해 주세요.`,
    );
  }

  const passwordMatched = await verifyPassword(params.password, user.passwordHash);

  if (!passwordMatched) {
    const nextFailCount = user.loginFailCount + 1;
    const shouldLock = nextFailCount >= MAX_LOGIN_FAILURES;

    await prisma.siteUser.update({
      where: { userId: user.userId },
      data: {
        loginFailCount: nextFailCount,
        accountStatus: shouldLock ? AccountStatus.LOCKED : user.accountStatus,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + LOCK_DURATION_MINUTES * 60_000)
          : user.lockedUntil,
      },
    });

    if (shouldLock) {
      throw new TooManyRequestsError(
        `로그인 실패가 ${MAX_LOGIN_FAILURES}회 누적되어 계정이 ${LOCK_DURATION_MINUTES}분간 잠금되었습니다.`,
      );
    }
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  await prisma.siteUser.update({
    where: { userId: user.userId },
    data: {
      loginFailCount: 0,
      lockedUntil: null,
      accountStatus: AccountStatus.ACTIVE,
      lastLoginAt: now,
    },
  });

  // 로그아웃 상태에서 신청한 예약이 있으면 이번 로그인에 맞춰 계정에 연결한다.
  await linkReservationsToUser({ userId: user.userId, email: user.email, name: user.name });

  return { userId: user.userId, email: user.email, name: user.name };
}

/**
 * 현재 요청의 회원 세션을 확인하고 DB 에서 계정이 여전히 유효한지 재검증한다.
 * (세션 발급 이후 비활성화된 계정이 계속 접근하는 것을 막는다)
 */
export async function requireActiveUser(): Promise<UserSession> {
  const session = await getUserSession();
  if (!session) {
    throw new UnauthorizedError('로그인이 필요합니다.');
  }

  const user = await prisma.siteUser.findFirst({
    where: { userId: session.userId, deletedAt: null },
    select: { userId: true, email: true, name: true, accountStatus: true },
  });

  if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
    throw new UnauthorizedError(
      '세션이 만료되었거나 사용할 수 없는 계정입니다. 다시 로그인해 주세요.',
    );
  }

  return { userId: user.userId, email: user.email, name: user.name };
}

/** 신청 폼 자동완성에 사용할 회원 정보 */
export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  return prisma.siteUser.findFirst({
    where: { userId, deletedAt: null, accountStatus: AccountStatus.ACTIVE },
    select: {
      userId: true,
      email: true,
      name: true,
      companyOrBranchName: true,
      vehicleNo: true,
    },
  });
}

export type UpdateUserProfileInput = {
  name: string;
  companyOrBranchName: string;
  vehicleNo?: string | null;
  /** 값이 있으면 비밀번호를 변경한다. */
  password?: string;
};

export async function updateUserProfile(
  userId: number,
  input: UpdateUserProfileInput,
): Promise<UserProfile> {
  if (input.password !== undefined && !isUserPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(USER_PASSWORD_POLICY_MESSAGE, {
      password: [USER_PASSWORD_POLICY_MESSAGE],
    });
  }

  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;

  return prisma.siteUser.update({
    where: { userId },
    data: {
      name: input.name.trim(),
      companyOrBranchName: input.companyOrBranchName.trim(),
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
      userId: true,
      email: true,
      name: true,
      companyOrBranchName: true,
      vehicleNo: true,
    },
  });
}
