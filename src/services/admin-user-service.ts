import { AccountStatus, AdminRole, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { maskEmail, maskPhone } from '@/lib/masking';
import { hashPassword, isPasswordPolicySatisfied, PASSWORD_POLICY_MESSAGE } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 관리자 계정 관리 (SYSTEM_ADMIN 전용) */

export type AdminUserListItem = {
  adminUserId: number;
  loginId: string;
  adminName: string;
  emailMasked: string;
  phoneMasked: string;
  roleCode: AdminRole;
  accountStatus: AccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const rows = await prisma.adminUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ roleCode: 'asc' }, { adminUserId: 'asc' }],
    select: {
      adminUserId: true,
      loginId: true,
      adminName: true,
      email: true,
      phone: true,
      roleCode: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    adminUserId: row.adminUserId,
    loginId: row.loginId,
    adminName: row.adminName,
    emailMasked: maskEmail(row.email),
    phoneMasked: maskPhone(row.phone),
    roleCode: row.roleCode,
    accountStatus: row.accountStatus,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }));
}

export type CreateAdminUserInput = {
  loginId: string;
  password: string;
  adminName: string;
  email: string;
  phone?: string | null;
  roleCode: AdminRole;
};

export async function createAdminUser(
  input: CreateAdminUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  if (!isPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(PASSWORD_POLICY_MESSAGE, { password: [PASSWORD_POLICY_MESSAGE] });
  }

  try {
    const created = await prisma.adminUser.create({
      data: {
        loginId: input.loginId.trim(),
        passwordHash: await hashPassword(input.password),
        adminName: input.adminName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        roleCode: input.roleCode,
        accountStatus: AccountStatus.ACTIVE,
        passwordChangedAt: new Date(),
      },
      select: { adminUserId: true, loginId: true, roleCode: true },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.ADMIN_USER_CREATE,
      targetType: AUDIT_TARGETS.ADMIN_USER,
      targetId: created.adminUserId,
      detail: { loginId: created.loginId, roleCode: created.roleCode },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        '이미 사용 중인 로그인 ID 또는 이메일입니다.',
        'DUPLICATE_ADMIN_USER',
      );
    }
    throw error;
  }
}

export type UpdateAdminUserInput = {
  adminName?: string;
  email?: string;
  phone?: string | null;
  roleCode?: AdminRole;
  accountStatus?: AccountStatus;
  /** 값이 있으면 비밀번호를 재설정한다. */
  password?: string;
};

export async function updateAdminUser(
  adminUserId: number,
  input: UpdateAdminUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminUser.findFirst({ where: { adminUserId, deletedAt: null } });
  if (!current) throw new NotFoundError('관리자 계정을 찾을 수 없습니다.');

  if (input.password !== undefined && !isPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(PASSWORD_POLICY_MESSAGE, { password: [PASSWORD_POLICY_MESSAGE] });
  }

  // 마지막 남은 활성 SYSTEM_ADMIN 을 스스로 비활성화하거나 권한을 낮추지 못하게 막는다.
  const losingSystemAdmin =
    current.roleCode === AdminRole.SYSTEM_ADMIN &&
    ((input.roleCode !== undefined && input.roleCode !== AdminRole.SYSTEM_ADMIN) ||
      (input.accountStatus !== undefined && input.accountStatus !== AccountStatus.ACTIVE));

  if (losingSystemAdmin) {
    const activeSystemAdmins = await prisma.adminUser.count({
      where: {
        roleCode: AdminRole.SYSTEM_ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        deletedAt: null,
        adminUserId: { not: adminUserId },
      },
    });
    if (activeSystemAdmins === 0) {
      throw new ConflictError(
        '활성 상태의 시스템 관리자가 최소 1명은 있어야 합니다.',
        'LAST_SYSTEM_ADMIN',
      );
    }
  }

  try {
    const updated = await prisma.adminUser.update({
      where: { adminUserId },
      data: {
        ...(input.adminName !== undefined ? { adminName: input.adminName.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.roleCode !== undefined ? { roleCode: input.roleCode } : {}),
        ...(input.accountStatus !== undefined
          ? {
              accountStatus: input.accountStatus,
              // 잠금 해제 시 실패 횟수 초기화
              loginFailCount: input.accountStatus === AccountStatus.ACTIVE ? 0 : undefined,
              lockedUntil: input.accountStatus === AccountStatus.ACTIVE ? null : undefined,
            }
          : {}),
        ...(input.password !== undefined
          ? {
              passwordHash: await hashPassword(input.password),
              passwordChangedAt: new Date(),
              loginFailCount: 0,
              lockedUntil: null,
            }
          : {}),
      },
      select: { adminUserId: true, loginId: true, roleCode: true, accountStatus: true },
    });

    const deactivated =
      current.accountStatus === AccountStatus.ACTIVE &&
      updated.accountStatus !== AccountStatus.ACTIVE;

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: deactivated
        ? AUDIT_ACTIONS.ADMIN_USER_DEACTIVATE
        : AUDIT_ACTIONS.ADMIN_USER_UPDATE,
      targetType: AUDIT_TARGETS.ADMIN_USER,
      targetId: adminUserId,
      detail: {
        loginId: updated.loginId,
        passwordChanged: input.password !== undefined,
        before: { roleCode: current.roleCode, accountStatus: current.accountStatus },
        after: { roleCode: updated.roleCode, accountStatus: updated.accountStatus },
      },
      context: actor.requestContext,
    });

    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 사용 중인 이메일입니다.', 'DUPLICATE_ADMIN_USER');
    }
    throw error;
  }
}
