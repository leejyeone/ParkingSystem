import { AccountStatus, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/**
 * 관리자용 직원 계정 관리.
 *
 * 전 직원 명부는 scripts/import-employees.ts 로 1회성 시드 주입되고, 입사자가 생기면
 * 그 스크립트를 최신 명부로 다시 돌리거나(다수 등록), 이 화면에서 관리자가 개별로
 * 바로 추가할 수 있다(소수 등록·긴급 등록). 어느 쪽이든 사번(employeeCode)만 맞으면
 * 즉시 로그인되므로, 직접 추가한 계정도 시드로 만든 계정과 동일하게 작동한다.
 *
 * 사번(employeeCode)은 비밀번호 없이 로그인하는 유일한 자격 증명이라, 비밀번호 해시와
 * 같은 취급으로 관리자 화면에도 절대 내려보내지 않는다(select 자체에서 제외).
 */

export type EmployeeUserListItem = {
  employeeUserId: number;
  name: string;
  departmentName: string;
  email: string;
  accountStatus: AccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type CreateEmployeeUserInput = {
  employeeCode: string;
  email: string;
  name: string;
  departmentName: string;
  vehicleNo?: string | null;
  companyOrBranchName?: string | null;
};

/**
 * 관리자가 직원 계정을 직접 생성한다. 시드 임포트와 달리 관리자가 이미 확인하고
 * 등록하는 것이므로 INACTIVE 로 만들 필요 없이 바로 ACTIVE 로 생성한다.
 */
export async function createEmployeeUser(
  input: CreateEmployeeUserInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  try {
    const created = await prisma.employeeUser.create({
      data: {
        employeeCode: input.employeeCode.trim(),
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        departmentName: input.departmentName.trim(),
        vehicleNo: input.vehicleNo?.trim() || null,
        companyOrBranchName: input.companyOrBranchName?.trim() || null,
        accountStatus: AccountStatus.ACTIVE,
      },
      select: {
        employeeUserId: true,
        employeeCode: true,
        email: true,
        name: true,
        departmentName: true,
        accountStatus: true,
      },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.EMPLOYEE_USER_CREATE,
      targetType: AUDIT_TARGETS.EMPLOYEE_USER,
      targetId: created.employeeUserId,
      detail: {
        employeeCode: created.employeeCode,
        email: created.email,
        departmentName: created.departmentName,
      },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 등록된 사번 또는 이메일입니다.', 'DUPLICATE_EMPLOYEE');
    }
    throw error;
  }
}

export async function listEmployeeUsers(): Promise<EmployeeUserListItem[]> {
  return prisma.employeeUser.findMany({
    where: { deletedAt: null },
    orderBy: [{ employeeUserId: 'asc' }],
    select: {
      employeeUserId: true,
      name: true,
      departmentName: true,
      email: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export type UpdateEmployeeUserInput = {
  accountStatus: AccountStatus;
};

export type EmployeeUserProfileForAdmin = {
  employeeUserId: number;
  name: string;
  email: string;
  departmentName: string;
  vehicleNo: string | null;
};

/** 반복 예약 등록 화면 등 관리자 전용 폼에서 직원 선택 시 성명·이메일·차량번호를 자동 채우기 위한 조회. */
export async function getEmployeeUserProfileForAdmin(
  employeeUserId: number,
): Promise<EmployeeUserProfileForAdmin> {
  const employee = await prisma.employeeUser.findFirst({
    where: { employeeUserId, deletedAt: null, accountStatus: AccountStatus.ACTIVE },
    select: {
      employeeUserId: true,
      name: true,
      email: true,
      departmentName: true,
      vehicleNo: true,
    },
  });
  if (!employee) throw new NotFoundError('직원 계정을 찾을 수 없습니다.');
  return employee;
}

/** 직원 계정 상태(활성·비활성) 전환. 이름/부서/이메일은 명부로만 갱신되므로 여기서 다루지 않는다. */
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
    data: { accountStatus: input.accountStatus },
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
