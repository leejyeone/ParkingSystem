import { AccountStatus, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { hashPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/**
 * 관리자용 직원 계정 관리.
 *
 * 그룹웨어 SSO 연동 전까지 관리자가 직원 계정을 직접 만들고, 퇴사자를 비활성화하기 위한
 * 최소 기능이다. 초기 비밀번호는 모두 동일하게 부여하고, 직원이 로그인 후 마이페이지에서
 * 직접 바꾸도록 안내한다.
 */
export const EMPLOYEE_INITIAL_PASSWORD = 'Synopex123!@#';

export type EmployeeUserListItem = {
  employeeUserId: number;
  name: string;
  branchName: string;
  department: string | null;
  email: string;
  accountStatus: AccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listEmployeeUsers(): Promise<EmployeeUserListItem[]> {
  return prisma.employeeUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ employeeUserId: 'asc' }],
    select: {
      employeeUserId: true,
      name: true,
      branchName: true,
      department: true,
      email: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export type CreateEmployeeUserInput = {
  email: string;
  name: string;
  branchName: string;
  department?: string | null;
};

export async function createEmployeeUser(
  input: CreateEmployeeUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const email = input.email.trim().toLowerCase();

  try {
    const created = await prisma.employeeUser.create({
      data: {
        email,
        passwordHash: await hashPassword(EMPLOYEE_INITIAL_PASSWORD),
        name: input.name.trim(),
        branchName: input.branchName.trim(),
        department: input.department?.trim() || null,
        accountStatus: AccountStatus.ACTIVE,
        passwordChangedAt: new Date(),
        // 고정된 초기 비밀번호를 그대로 쓰므로, 첫 로그인 때 반드시 바꾸도록 강제한다.
        mustChangePassword: true,
      },
      select: { employeeUserId: true, email: true },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.EMPLOYEE_USER_CREATE,
      targetType: AUDIT_TARGETS.EMPLOYEE_USER,
      targetId: created.employeeUserId,
      detail: { email: created.email },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 사용 중인 이메일입니다.', 'DUPLICATE_EMPLOYEE_USER');
    }
    throw error;
  }
}

export type UpdateEmployeeUserInput = {
  name?: string;
  branchName?: string;
  department?: string;
  accountStatus?: AccountStatus;
};

/** 직원 계정 수정 — 이름/소속/부서, 계정 상태(활성·비활성). 이메일과 비밀번호는 여기서 다루지 않는다. */
export async function updateEmployeeUser(
  employeeUserId: number,
  input: UpdateEmployeeUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.employeeUser.findFirst({
    where: { employeeUserId, deletedAt: null },
  });
  if (!current) throw new NotFoundError('직원 계정을 찾을 수 없습니다.');

  const updated = await prisma.employeeUser.update({
    where: { employeeUserId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.branchName !== undefined ? { branchName: input.branchName.trim() } : {}),
      ...(input.department !== undefined ? { department: input.department.trim() || null } : {}),
      ...(input.accountStatus !== undefined
        ? {
            accountStatus: input.accountStatus,
            // 재활성화 시 로그인 실패 횟수·잠금을 함께 푼다.
            loginFailCount: input.accountStatus === AccountStatus.ACTIVE ? 0 : undefined,
            lockedUntil: input.accountStatus === AccountStatus.ACTIVE ? null : undefined,
          }
        : {}),
    },
    select: { employeeUserId: true, email: true, accountStatus: true },
  });

  const deactivated =
    current.accountStatus === AccountStatus.ACTIVE &&
    updated.accountStatus !== AccountStatus.ACTIVE;
  const reactivated =
    current.accountStatus !== AccountStatus.ACTIVE &&
    updated.accountStatus === AccountStatus.ACTIVE;

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: deactivated
      ? AUDIT_ACTIONS.EMPLOYEE_USER_DEACTIVATE
      : reactivated
        ? AUDIT_ACTIONS.EMPLOYEE_USER_REACTIVATE
        : AUDIT_ACTIONS.EMPLOYEE_USER_UPDATE,
    targetType: AUDIT_TARGETS.EMPLOYEE_USER,
    targetId: employeeUserId,
    detail: {
      email: updated.email,
      before: { accountStatus: current.accountStatus },
      after: { accountStatus: updated.accountStatus },
    },
    context: actor.requestContext,
  });

  return updated;
}

export type BulkEmployeeStatusResult = {
  succeeded: number[];
  failed: { employeeUserId: number; message: string }[];
};

/**
 * 여러 직원 계정을 한 번에 활성화/비활성화한다.
 * 한 건씩 updateEmployeeUser() 를 거치므로 개별 감사 로그(활성화/비활성화)는 그대로 남는다.
 */
export async function bulkUpdateEmployeeStatus(
  params: { employeeUserIds: number[]; accountStatus: AccountStatus } & {
    adminUserId: number;
    requestContext?: RequestContext;
  },
): Promise<BulkEmployeeStatusResult> {
  const result: BulkEmployeeStatusResult = { succeeded: [], failed: [] };

  for (const employeeUserId of params.employeeUserIds) {
    try {
      await updateEmployeeUser(
        employeeUserId,
        { accountStatus: params.accountStatus },
        { adminUserId: params.adminUserId, requestContext: params.requestContext },
      );
      result.succeeded.push(employeeUserId);
    } catch (error) {
      result.failed.push({
        employeeUserId,
        message: error instanceof Error ? error.message : '처리에 실패했습니다.',
      });
    }
  }

  return result;
}
