import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 법인 공용 차량 관리(차량 자체의 기본 정보 CRUD). 운행 신청 처리는 company-vehicle-trip-service.ts. */

const VEHICLE_SELECT = {
  vehicleId: true,
  vehicleNo: true,
  vehicleModel: true,
  memo: true,
  isActive: true,
  parkingSpaceId: true,
  parkingSpace: {
    select: {
      spaceId: true,
      spaceCode: true,
      area: { select: { areaId: true, areaCode: true, areaName: true } },
    },
  },
} satisfies Prisma.CompanyVehicleSelect;

export async function listCompanyVehicles(options: { includeInactive?: boolean } = {}) {
  return prisma.companyVehicle.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ vehicleId: 'asc' }],
    select: VEHICLE_SELECT,
  });
}

export type CompanyVehicleInput = {
  vehicleNo: string;
  vehicleModel?: string | null;
  memo?: string | null;
  /** 이 주차면은 방문 예약 배정 후보에서 제외되고, 모든 평면도에 다른 색으로 표시된다. */
  parkingSpaceId?: number | null;
  isActive?: boolean;
};

async function assertSpaceNotTakenByOtherVehicle(
  parkingSpaceId: number,
  excludeVehicleId?: number,
): Promise<void> {
  const taken = await prisma.companyVehicle.findFirst({
    where: { parkingSpaceId, vehicleId: excludeVehicleId ? { not: excludeVehicleId } : undefined },
    select: { vehicleId: true, vehicleNo: true },
  });
  if (taken) {
    throw new ValidationError('이미 다른 법인차량이 사용 중인 주차 위치입니다.', {
      parkingSpaceId: [`이미 "${taken.vehicleNo}" 차량이 배정된 주차 위치입니다.`],
    });
  }
}

export async function createCompanyVehicle(
  input: CompanyVehicleInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  if (input.parkingSpaceId) {
    const space = await prisma.parkingSpace.findUnique({ where: { spaceId: input.parkingSpaceId } });
    if (!space) throw new NotFoundError('주차면을 찾을 수 없습니다.');
    await assertSpaceNotTakenByOtherVehicle(input.parkingSpaceId);
  }

  const created = await prisma.companyVehicle.create({
    data: {
      vehicleNo: input.vehicleNo.trim(),
      vehicleModel: input.vehicleModel?.trim() || null,
      memo: input.memo?.trim() || null,
      parkingSpaceId: input.parkingSpaceId ?? null,
      isActive: input.isActive ?? true,
    },
    select: VEHICLE_SELECT,
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_CREATE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE,
    targetId: created.vehicleId,
    detail: { vehicleNo: created.vehicleNo, parkingSpaceId: created.parkingSpaceId },
    context: actor.requestContext,
  });

  return created;
}

export async function updateCompanyVehicle(
  vehicleId: number,
  input: Partial<CompanyVehicleInput>,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.companyVehicle.findUnique({ where: { vehicleId } });
  if (!current) throw new NotFoundError('법인차량을 찾을 수 없습니다.');

  if (input.parkingSpaceId !== undefined && input.parkingSpaceId !== null) {
    const space = await prisma.parkingSpace.findUnique({ where: { spaceId: input.parkingSpaceId } });
    if (!space) throw new NotFoundError('주차면을 찾을 수 없습니다.');
    await assertSpaceNotTakenByOtherVehicle(input.parkingSpaceId, vehicleId);
  }

  try {
    const updated = await prisma.companyVehicle.update({
      where: { vehicleId },
      data: {
        ...(input.vehicleNo !== undefined ? { vehicleNo: input.vehicleNo.trim() } : {}),
        ...(input.vehicleModel !== undefined
          ? { vehicleModel: input.vehicleModel?.trim() || null }
          : {}),
        ...(input.memo !== undefined ? { memo: input.memo?.trim() || null } : {}),
        ...(input.parkingSpaceId !== undefined ? { parkingSpaceId: input.parkingSpaceId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: VEHICLE_SELECT,
    });

    const deactivated = current.isActive && updated.isActive === false;
    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: deactivated
        ? AUDIT_ACTIONS.COMPANY_VEHICLE_DEACTIVATE
        : AUDIT_ACTIONS.COMPANY_VEHICLE_UPDATE,
      targetType: AUDIT_TARGETS.COMPANY_VEHICLE,
      targetId: vehicleId,
      detail: {
        vehicleNo: updated.vehicleNo,
        before: { parkingSpaceId: current.parkingSpaceId, isActive: current.isActive },
        after: { parkingSpaceId: updated.parkingSpaceId, isActive: updated.isActive },
      },
      context: actor.requestContext,
    });

    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 다른 법인차량이 사용 중인 주차 위치입니다.', 'DUPLICATE_SPACE');
    }
    throw error;
  }
}

/**
 * 법인차량 비활성화. (소프트 삭제 — isActive 를 false 로 바꾸고 행은 남긴다)
 *
 * 과거 운행일지(CompanyVehicleTrip)가 이 차량을 참조하므로 물리 삭제하지 않는다.
 */
export async function deactivateCompanyVehicle(
  vehicleId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.companyVehicle.findUnique({
    where: { vehicleId },
    select: { vehicleId: true, vehicleNo: true },
  });
  if (!current) throw new NotFoundError('법인차량을 찾을 수 없습니다.');

  await prisma.companyVehicle.update({ where: { vehicleId }, data: { isActive: false } });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_DEACTIVATE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE,
    targetId: vehicleId,
    detail: { vehicleNo: current.vehicleNo },
    context: actor.requestContext,
  });

  return { vehicleId };
}
