import { AccountStatus } from '@prisma/client';

import { SITE_USER_RESET_PASSWORD } from '@/domain/site-user';
import { hashPassword } from '@/lib/password';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

/**
 * 관리자용 회원(SiteUser) 계정 관리.
 *
 * 회원은 이메일/비밀번호로 스스로 가입하는 선택 계정이라, 직원 계정과 달리 관리자가
 * 대신 만들어주는 기능은 없다. 목록 조회·활성/비활성 전환·비밀번호 재설정만 제공한다.
 */

export type SiteUserListItem = {
  userId: number;
  email: string;
  name: string;
  companyOrBranchName: string;
  accountStatus: AccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listSiteUsers(): Promise<SiteUserListItem[]> {
  return prisma.siteUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ userId: 'asc' }],
    select: {
      userId: true,
      email: true,
      name: true,
      companyOrBranchName: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

/**
 * 회원 계정 상태(활성·비활성) 전환.
 *
 * ACTIVE 로 바꿀 때는 로그인 실패 누적으로 걸린 자동 잠금(LOCKED)도 함께 풀어준다 —
 * 화면에는 "잠금해제"라는 별도 개념을 두지 않고, 활성화 스위치 하나로 처리한다.
 */
export async function updateSiteUserStatus(
  userId: number,
  accountStatus: AccountStatus,
): Promise<{ userId: number; email: string; accountStatus: AccountStatus }> {
  const current = await prisma.siteUser.findFirst({ where: { userId, deletedAt: null } });
  if (!current) throw new NotFoundError('회원 계정을 찾을 수 없습니다.');

  return prisma.siteUser.update({
    where: { userId },
    data: {
      accountStatus,
      ...(accountStatus === AccountStatus.ACTIVE
        ? { loginFailCount: 0, lockedUntil: null }
        : {}),
    },
    select: { userId: true, email: true, accountStatus: true },
  });
}

export type BulkSiteUserStatusResult = {
  succeeded: number[];
  failed: { userId: number; message: string }[];
};

/** 여러 회원 계정을 한 번에 활성화/비활성화한다. */
export async function bulkUpdateSiteUserStatus(params: {
  userIds: number[];
  accountStatus: AccountStatus;
}): Promise<BulkSiteUserStatusResult> {
  const result: BulkSiteUserStatusResult = { succeeded: [], failed: [] };

  for (const userId of params.userIds) {
    try {
      await updateSiteUserStatus(userId, params.accountStatus);
      result.succeeded.push(userId);
    } catch (error) {
      result.failed.push({
        userId,
        message: error instanceof Error ? error.message : '처리에 실패했습니다.',
      });
    }
  }

  return result;
}

/**
 * 회원이 비밀번호를 잊었을 때 관리자가 대신 재설정한다(셀프서비스 비밀번호 찾기가
 * 아직 없어 문의를 받으면 이 기능으로 처리한다). 회원별로 다른 임시 비밀번호를
 * 만들지 않고 항상 `SITE_USER_RESET_PASSWORD` 고정값으로 초기화한다.
 */
export async function resetSiteUserPassword(
  userId: number,
): Promise<{ userId: number; email: string }> {
  const current = await prisma.siteUser.findFirst({
    where: { userId, deletedAt: null },
    select: { userId: true, email: true },
  });
  if (!current) throw new NotFoundError('회원 계정을 찾을 수 없습니다.');

  await prisma.siteUser.update({
    where: { userId },
    data: {
      passwordHash: await hashPassword(SITE_USER_RESET_PASSWORD),
      passwordChangedAt: new Date(),
      loginFailCount: 0,
      lockedUntil: null,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  return { userId: current.userId, email: current.email };
}
