import { Prisma, ReservationStatus } from '@prisma/client';

import { resolveCompanyVehicleDisplayStatus } from '@/domain/reservation-status';
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
  const vehicles = await prisma.companyVehicle.findMany({
    where: { deletedAt: null, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ vehicleId: 'asc' }],
    select: VEHICLE_SELECT,
  });

  // "지금 사용중인가"는 오직 resolveCompanyVehicleDisplayStatus(reservation-status.ts)로만
  // 판정한다 — 여기서는 승인 완료 트립만 후보로 추려오고(성능을 위한 사전 필터), 실제 시간
  // 비교는 그 함수에 맡긴다.
  const now = new Date();
  const approvedTrips = await prisma.companyVehicleTrip.findMany({
    where: {
      assignedVehicleId: { in: vehicles.map((vehicle) => vehicle.vehicleId) },
      tripStatus: ReservationStatus.APPROVED,
    },
    select: {
      assignedVehicleId: true,
      tripStatus: true,
      requestStartAt: true,
      requestEndAt: true,
    },
  });
  const inUseVehicleIds = new Set(
    approvedTrips
      .filter((trip) => resolveCompanyVehicleDisplayStatus(trip, now) === 'IN_USE')
      .map((trip) => trip.assignedVehicleId),
  );

  return vehicles.map((vehicle) => ({ ...vehicle, inUse: inUseVehicleIds.has(vehicle.vehicleId) }));
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
    where: {
      parkingSpaceId,
      deletedAt: null,
      vehicleId: excludeVehicleId ? { not: excludeVehicleId } : undefined,
    },
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
  if (!current || current.deletedAt) throw new NotFoundError('법인차량을 찾을 수 없습니다.');

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
 * 과거 운행일지(CompanyVehicleTrip)가 이 차량을 참조하므로, 이력이 있는 차량은 이쪽을 쓴다.
 */
export async function deactivateCompanyVehicle(
  vehicleId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.companyVehicle.findUnique({
    where: { vehicleId },
    select: { vehicleId: true, vehicleNo: true, deletedAt: true },
  });
  if (!current || current.deletedAt) throw new NotFoundError('법인차량을 찾을 수 없습니다.');

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

/**
 * 법인차량 삭제(소프트 삭제 — `deletedAt`을 채우고 행은 남긴다).
 *
 * 삭제되면 `isActive`도 항상 같이 꺼진다 — 삭제인데 활성 상태로 남으면, `deletedAt`을
 * 안 보고 `isActive`만 확인하는 조회(예: 운행 신청 시 차량 검증)에서 삭제된 차량이 계속
 * 배정 가능한 것처럼 새어 나간다. 물리적으로 지우지 않으므로 운행 이력
 * (CompanyVehicleTrip)이 있어도 안전하게 삭제할 수 있다 — 삭제된 차량은
 * `listCompanyVehicles` 등 모든 조회에서 `deletedAt: null` 조건에 걸러져 화면에서는
 * 사라지지만, 과거 운행 기록은 그대로 남는다.
 */
export async function deleteCompanyVehicle(
  vehicleId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.companyVehicle.findUnique({
    where: { vehicleId },
    select: { vehicleId: true, vehicleNo: true, deletedAt: true },
  });
  if (!current || current.deletedAt) throw new NotFoundError('법인차량을 찾을 수 없습니다.');

  // parkingSpaceId 도 같이 비워야 한다 — 안 비우면 소프트 삭제된 차량이어도 주차면 쪽
  // 조회(대시보드·평면도·예약 배정 후보 등)에서 여전히 "이 차량이 배정된 자리"로 잡혀
  // 그 자리가 계속 법인차량 전용/비활성 취급된다(관계 자체가 안 끊기기 때문). isActive도
  // 같이 꺼서 "삭제 = 항상 비활성" 원칙을 지킨다(위 함수 주석 참고).
  await prisma.companyVehicle.update({
    where: { vehicleId },
    data: { deletedAt: new Date(), parkingSpaceId: null, isActive: false },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_DELETE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE,
    targetId: vehicleId,
    detail: { vehicleNo: current.vehicleNo },
    context: actor.requestContext,
  });

  return { vehicleId };
}
