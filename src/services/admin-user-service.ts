import { AccountStatus, AdminRole, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors';
import {
  hashPassword,
  isPasswordPolicySatisfied,
  PASSWORD_POLICY_MESSAGE,
  verifyPassword,
} from '@/lib/password';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/**
 * 관리자 계정 관리.
 *
 * 관리자는 시스템 관리자(SYSTEM_ADMIN)/주차 관리자(PARKING_ADMIN) 두 권한으로 나뉜다.
 * 관리자 계정 생성 화면(및 이 서비스를 부르는 API 라우트) 자체가 이미 시스템 관리자만
 * 접근할 수 있으므로, 그 화면에서 role 을 직접 선택해 넘겨도 주차 관리자가 스스로를
 * 시스템 관리자로 승격시키는 경로는 생기지 않는다.
 */

export type AdminUserListItem = {
  adminUserId: number;
  adminName: string;
  email: string;
  phone: string | null;
  accountStatus: AccountStatus;
  role: AdminRole;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const rows = await prisma.adminUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ adminUserId: 'asc' }],
    select: {
      adminUserId: true,
      adminName: true,
      email: true,
      phone: true,
      accountStatus: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    adminUserId: row.adminUserId,
    adminName: row.adminName,
    email: row.email,
    phone: row.phone,
    accountStatus: row.accountStatus,
    role: row.role,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }));
}

export type CreateAdminUserInput = {
  password: string;
  adminName: string;
  email: string;
  phone?: string | null;
  /** 기본값 PARKING_ADMIN. */
  role?: AdminRole;
};

export async function createAdminUser(
  input: CreateAdminUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  if (!isPasswordPolicySatisfied(input.password)) {
    throw new ValidationError(PASSWORD_POLICY_MESSAGE, { password: [PASSWORD_POLICY_MESSAGE] });
  }

  const email = input.email.trim().toLowerCase();
  const role = input.role ?? AdminRole.PARKING_ADMIN;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.create({
        data: {
          passwordHash: await hashPassword(input.password),
          adminName: input.adminName.trim(),
          email,
          phone: input.phone?.trim() || null,
          accountStatus: AccountStatus.ACTIVE,
          role,
          passwordChangedAt: new Date(),
        },
        select: { adminUserId: true, email: true },
      });

      /*
       * 관리자 계정의 이메일을 알림 수신자 목록에도 자동으로 올린다 — 등록만 해두고
       * 정작 신규 신청/승인 알림을 못 받는 사고를 막기 위함이다. 이미 같은 이메일이
       * 알림 목록에 있으면(예: 공용 배포 주소로 미리 등록됐던 경우) 기존 설정(수신
       * 여부, 활성화 상태)은 그대로 두고 건드리지 않는다.
       *
       * isActive 는 false 로 넣는다 — 계정을 만든다고 곧바로 실제 메일을 받기 시작하면
       * 관리자가 의도하지 않은 수신자가 늘어날 수 있으니, 알림 이메일 설정 화면에서
       * 직접 확인하고 켜도록 한다.
       */
      await tx.adminNotificationEmail.upsert({
        where: { email },
        create: {
          email,
          recipientName: input.adminName.trim(),
          receiveNewRequest: true,
          receiveChangeAlert: true,
          isActive: false,
        },
        update: {},
      });

      return admin;
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.ADMIN_USER_CREATE,
      targetType: AUDIT_TARGETS.ADMIN_USER,
      targetId: created.adminUserId,
      detail: { email: created.email, role },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 사용 중인 이메일입니다.', 'DUPLICATE_ADMIN_USER');
    }
    throw error;
  }
}

/** 마지막 남은 활성 관리자를 잃게 되는지 확인한다. 잃으면 아무도 시스템에 못 들어간다. */
async function assertNotLastActiveAdmin(adminUserId: number): Promise<void> {
  const otherActiveAdmins = await prisma.adminUser.count({
    where: {
      accountStatus: AccountStatus.ACTIVE,
      deletedAt: null,
      adminUserId: { not: adminUserId },
    },
  });
  if (otherActiveAdmins === 0) {
    throw new ConflictError('활성 상태의 관리자가 최소 1명은 있어야 합니다.', 'LAST_ACTIVE_ADMIN');
  }
}

/**
 * 마지막 남은 활성 시스템 관리자를 잃게 되는지 확인한다. 잃으면 아무도 반복 예약·
 * 관리자 계정 관리 등 시스템 관리 화면에 못 들어가 스스로 복구할 방법이 없어진다.
 * 대상 계정이 시스템 관리자가 아니면(=주차 관리자) 검사할 필요가 없다.
 */
async function assertNotLastActiveSystemAdmin(adminUserId: number, role: AdminRole): Promise<void> {
  if (role !== AdminRole.SYSTEM_ADMIN) return;

  const otherActiveSystemAdmins = await prisma.adminUser.count({
    where: {
      accountStatus: AccountStatus.ACTIVE,
      deletedAt: null,
      role: AdminRole.SYSTEM_ADMIN,
      adminUserId: { not: adminUserId },
    },
  });
  if (otherActiveSystemAdmins === 0) {
    throw new ConflictError(
      '활성 상태의 시스템 관리자가 최소 1명은 있어야 합니다.',
      'LAST_ACTIVE_SYSTEM_ADMIN',
    );
  }
}

/**
 * 다른 관리자 계정 수정. 비밀번호는 여기서 다루지 않는다 — 관리자라도 남의 비밀번호를
 * 바꿀 수 없다. 본인 비밀번호 변경은 changeOwnAdminPassword() 를 따로 쓴다.
 */
export type UpdateAdminUserInput = {
  adminName?: string;
  email?: string;
  phone?: string | null;
  accountStatus?: AccountStatus;
};

export async function updateAdminUser(
  adminUserId: number,
  input: UpdateAdminUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminUser.findFirst({ where: { adminUserId, deletedAt: null } });
  if (!current) throw new NotFoundError('관리자 계정을 찾을 수 없습니다.');

  // 마지막 남은 활성 관리자를 스스로 비활성화하지 못하게 막는다.
  const losingLastActiveAdmin =
    input.accountStatus !== undefined && input.accountStatus !== AccountStatus.ACTIVE;

  if (losingLastActiveAdmin) {
    await assertNotLastActiveAdmin(adminUserId);
    await assertNotLastActiveSystemAdmin(adminUserId, current.role);
  }

  try {
    const updated = await prisma.adminUser.update({
      where: { adminUserId },
      data: {
        ...(input.adminName !== undefined ? { adminName: input.adminName.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.accountStatus !== undefined
          ? {
              accountStatus: input.accountStatus,
              // 잠금 해제 시 실패 횟수 초기화
              loginFailCount: input.accountStatus === AccountStatus.ACTIVE ? 0 : undefined,
              lockedUntil: input.accountStatus === AccountStatus.ACTIVE ? null : undefined,
            }
          : {}),
      },
      select: { adminUserId: true, email: true, accountStatus: true },
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
        email: updated.email,
        before: { accountStatus: current.accountStatus },
        after: { accountStatus: updated.accountStatus },
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

/**
 * 본인 비밀번호 변경. 현재 비밀번호 확인을 거쳐야 하며, 다른 관리자의 비밀번호는
 * 이 함수로도 바꿀 수 없다(adminUserId 는 항상 세션 본인 것만 넘어온다).
 */
export async function changeOwnAdminPassword(
  adminUserId: number,
  input: { currentPassword: string; newPassword: string },
  actor: { requestContext?: RequestContext },
): Promise<void> {
  const current = await prisma.adminUser.findFirst({ where: { adminUserId, deletedAt: null } });
  if (!current) throw new NotFoundError('관리자 계정을 찾을 수 없습니다.');

  const currentMatched = await verifyPassword(input.currentPassword, current.passwordHash);
  if (!currentMatched) {
    throw new UnauthorizedError('현재 비밀번호가 올바르지 않습니다.');
  }

  if (!isPasswordPolicySatisfied(input.newPassword)) {
    throw new ValidationError(PASSWORD_POLICY_MESSAGE, { newPassword: [PASSWORD_POLICY_MESSAGE] });
  }

  await prisma.adminUser.update({
    where: { adminUserId },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      passwordChangedAt: new Date(),
      loginFailCount: 0,
      lockedUntil: null,
    },
  });

  await writeAuditLog({
    actorAdminId: adminUserId,
    actionType: AUDIT_ACTIONS.ADMIN_USER_UPDATE,
    targetType: AUDIT_TARGETS.ADMIN_USER,
    targetId: adminUserId,
    detail: { email: current.email, passwordChanged: true, selfService: true },
    context: actor.requestContext,
  });
}

/**
 * 관리자 계정 삭제.
 *
 * 행을 지우지 않고 deleted_at 을 채운다. 이 계정은 감사 로그(actor_admin_id), 예약 승인자,
 * 상태 변경 이력에서 참조되므로 실제로 지우면 "누가 했는지" 가 사라진다.
 * 조회는 전부 `deletedAt: null` 조건을 쓰므로 화면에서는 사라진다.
 *
 * 다만 email 이 UNIQUE 라 같은 값으로 다시 만들 수는 없다.
 */
export async function deleteAdminUser(
  adminUserId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminUser.findFirst({ where: { adminUserId, deletedAt: null } });
  if (!current) throw new NotFoundError('관리자 계정을 찾을 수 없습니다.');

  // 자기 계정을 지우면 그 자리에서 로그아웃되고 되돌릴 수단도 없어진다.
  if (adminUserId === actor.adminUserId) {
    throw new ConflictError('본인 계정은 삭제할 수 없습니다.', 'CANNOT_DELETE_SELF');
  }
  await assertNotLastActiveAdmin(adminUserId);
  await assertNotLastActiveSystemAdmin(adminUserId, current.role);

  await prisma.adminUser.update({
    where: { adminUserId },
    data: { deletedAt: new Date(), accountStatus: AccountStatus.INACTIVE },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.ADMIN_USER_DELETE,
    targetType: AUDIT_TARGETS.ADMIN_USER,
    targetId: adminUserId,
    detail: { email: current.email },
    context: actor.requestContext,
  });

  return { adminUserId };
}
