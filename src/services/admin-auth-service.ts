import { AccountStatus, AdminRole } from '@prisma/client';

import { ForbiddenError, TooManyRequestsError, UnauthorizedError } from '@/lib/errors';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { getAdminSession, type AdminSession } from '@/lib/session';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/**
 * 관리자 인증 서비스.
 *
 * brute-force 방지
 *  - 연속 로그인 실패 5회 시 계정을 LOCKED 로 전환하고 10분간 잠근다.
 *  - 존재하지 않는 ID 도 더미 해시로 비교해 응답 시간 차이를 없앤다.
 *  - 모든 시도는 admin_login_attempts 에 기록한다.
 */

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_DURATION_MINUTES = 10;

const INVALID_CREDENTIALS_MESSAGE = '로그인 ID 또는 비밀번호가 올바르지 않습니다.';

export async function loginAdmin(params: {
  loginId: string;
  password: string;
  context?: RequestContext;
}): Promise<AdminSession> {
  const loginId = params.loginId.trim();

  const admin = await prisma.adminUser.findFirst({
    where: { loginId, deletedAt: null },
    select: {
      adminUserId: true,
      loginId: true,
      adminName: true,
      passwordHash: true,
      roleCode: true,
      accountStatus: true,
      loginFailCount: true,
      lockedUntil: true,
    },
  });

  if (!admin) {
    // 타이밍 공격 방지를 위해 존재하지 않는 계정도 동일한 비용으로 비교한다.
    await verifyPassword(params.password, DUMMY_PASSWORD_HASH);
    await recordLoginAttempt(loginId, false, params.context);
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  if (admin.accountStatus === AccountStatus.INACTIVE) {
    await recordLoginAttempt(loginId, false, params.context);
    throw new ForbiddenError('비활성화된 계정입니다. 시스템 관리자에게 문의해 주세요.');
  }

  const now = new Date();
  const isLocked =
    admin.accountStatus === AccountStatus.LOCKED &&
    admin.lockedUntil !== null &&
    admin.lockedUntil.getTime() > now.getTime();

  if (isLocked) {
    await recordLoginAttempt(loginId, false, params.context);
    throw new TooManyRequestsError(
      `로그인 실패가 반복되어 계정이 일시 잠금되었습니다. ${LOCK_DURATION_MINUTES}분 후 다시 시도해 주세요.`,
    );
  }

  const passwordMatched = await verifyPassword(params.password, admin.passwordHash);

  if (!passwordMatched) {
    const nextFailCount = admin.loginFailCount + 1;
    const shouldLock = nextFailCount >= MAX_LOGIN_FAILURES;

    await prisma.adminUser.update({
      where: { adminUserId: admin.adminUserId },
      data: {
        loginFailCount: nextFailCount,
        accountStatus: shouldLock ? AccountStatus.LOCKED : admin.accountStatus,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + LOCK_DURATION_MINUTES * 60_000)
          : admin.lockedUntil,
      },
    });
    await recordLoginAttempt(loginId, false, params.context);

    if (shouldLock) {
      throw new TooManyRequestsError(
        `로그인 실패가 ${MAX_LOGIN_FAILURES}회 누적되어 계정이 ${LOCK_DURATION_MINUTES}분간 잠금되었습니다.`,
      );
    }
    throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
  }

  await prisma.adminUser.update({
    where: { adminUserId: admin.adminUserId },
    data: {
      loginFailCount: 0,
      lockedUntil: null,
      accountStatus: AccountStatus.ACTIVE,
      lastLoginAt: now,
    },
  });
  await recordLoginAttempt(loginId, true, params.context);

  await writeAuditLog({
    actorAdminId: admin.adminUserId,
    actionType: AUDIT_ACTIONS.ADMIN_LOGIN,
    targetType: AUDIT_TARGETS.ADMIN_USER,
    targetId: admin.adminUserId,
    context: params.context,
  });

  return {
    adminUserId: admin.adminUserId,
    loginId: admin.loginId,
    adminName: admin.adminName,
    roleCode: admin.roleCode,
  };
}

async function recordLoginAttempt(
  loginId: string,
  succeeded: boolean,
  context?: RequestContext,
): Promise<void> {
  await prisma.adminLoginAttempt.create({
    data: {
      loginId: loginId.slice(0, 50),
      succeeded,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    },
  });
}

/**
 * 현재 요청의 관리자 세션을 확인하고, DB 에서 계정이 여전히 유효한지 재검증한다.
 * (세션 발급 이후 비활성화된 계정이 계속 접근하는 것을 막는다)
 */
export async function requireActiveAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new UnauthorizedError('로그인이 필요합니다.');
  }

  const admin = await prisma.adminUser.findFirst({
    where: { adminUserId: session.adminUserId, deletedAt: null },
    select: {
      adminUserId: true,
      loginId: true,
      adminName: true,
      roleCode: true,
      accountStatus: true,
    },
  });

  if (!admin || admin.accountStatus !== AccountStatus.ACTIVE) {
    throw new UnauthorizedError(
      '세션이 만료되었거나 사용할 수 없는 계정입니다. 다시 로그인해 주세요.',
    );
  }

  return {
    adminUserId: admin.adminUserId,
    loginId: admin.loginId,
    adminName: admin.adminName,
    roleCode: admin.roleCode,
  };
}

/** SYSTEM_ADMIN 전용 기능 보호 */
export async function requireSystemAdmin(): Promise<AdminSession> {
  const session = await requireActiveAdmin();
  if (session.roleCode !== AdminRole.SYSTEM_ADMIN) {
    throw new ForbiddenError('시스템 관리자만 접근할 수 있는 기능입니다.');
  }
  return session;
}
