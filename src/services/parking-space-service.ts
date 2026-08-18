import { Prisma, SpaceType } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 주차 구역 / 주차면 관리 (SYSTEM_ADMIN 전용) */

export async function listParkingAreas() {
  return prisma.parkingArea.findMany({
    orderBy: [{ displayOrder: 'asc' }, { areaId: 'asc' }],
    select: {
      areaId: true,
      areaCode: true,
      areaName: true,
      description: true,
      mapImageUrl: true,
      displayOrder: true,
      isActive: true,
    },
  });
}

export async function listParkingSpaces(options: { includeInactive?: boolean } = {}) {
  return prisma.parkingSpace.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { spaceId: 'asc' }],
    select: {
      spaceId: true,
      spaceCode: true,
      spaceName: true,
      spaceType: true,
      displayOrder: true,
      isActive: true,
      memo: true,
      area: { select: { areaId: true, areaCode: true, areaName: true } },
    },
  });
}

export type ParkingAreaInput = {
  areaCode: string;
  areaName: string;
  description?: string | null;
  /** 참고용 도면 이미지 경로. 좌표 정보는 저장하지 않는다. */
  mapImageUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
};

export async function createParkingArea(
  input: ParkingAreaInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  try {
    const created = await prisma.parkingArea.create({
      data: {
        areaCode: input.areaCode.trim().toUpperCase(),
        areaName: input.areaName.trim(),
        description: input.description?.trim() || null,
        mapImageUrl: input.mapImageUrl?.trim() || null,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.PARKING_AREA_CREATE,
      targetType: AUDIT_TARGETS.PARKING_AREA,
      targetId: created.areaId,
      detail: { areaCode: created.areaCode },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 존재하는 구역 코드입니다.', 'DUPLICATE_AREA_CODE');
    }
    throw error;
  }
}

export async function updateParkingArea(
  areaId: number,
  input: Partial<ParkingAreaInput>,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.parkingArea.findUnique({ where: { areaId } });
  if (!current) throw new NotFoundError('주차 구역을 찾을 수 없습니다.');

  const updated = await prisma.parkingArea.update({
    where: { areaId },
    data: {
      ...(input.areaName !== undefined ? { areaName: input.areaName.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.mapImageUrl !== undefined
        ? { mapImageUrl: input.mapImageUrl?.trim() || null }
        : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.PARKING_AREA_UPDATE,
    targetType: AUDIT_TARGETS.PARKING_AREA,
    targetId: areaId,
    detail: {
      areaCode: updated.areaCode,
      mapImageUrlChanged: current.mapImageUrl !== updated.mapImageUrl,
      isActive: updated.isActive,
    },
    context: actor.requestContext,
  });

  return updated;
}

export type ParkingSpaceInput = {
  areaId: number;
  spaceCode: string;
  spaceName?: string | null;
  spaceType: SpaceType;
  displayOrder: number;
  isActive: boolean;
  memo?: string | null;
};

export async function createParkingSpace(
  input: ParkingSpaceInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const area = await prisma.parkingArea.findUnique({ where: { areaId: input.areaId } });
  if (!area) throw new NotFoundError('주차 구역을 찾을 수 없습니다.');

  try {
    const created = await prisma.parkingSpace.create({
      data: {
        areaId: input.areaId,
        spaceCode: input.spaceCode.trim(),
        spaceName: input.spaceName?.trim() || null,
        spaceType: input.spaceType,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
        memo: input.memo?.trim() || null,
      },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.PARKING_SPACE_CREATE,
      targetType: AUDIT_TARGETS.PARKING_SPACE,
      targetId: created.spaceId,
      detail: { spaceCode: created.spaceCode, spaceType: created.spaceType },
      context: actor.requestContext,
    });

    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        '같은 구역에 이미 존재하는 주차면 코드입니다.',
        'DUPLICATE_SPACE_CODE',
      );
    }
    throw error;
  }
}

export async function updateParkingSpace(
  spaceId: number,
  input: Partial<ParkingSpaceInput>,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.parkingSpace.findUnique({ where: { spaceId } });
  if (!current) throw new NotFoundError('주차면을 찾을 수 없습니다.');

  try {
    const updated = await prisma.parkingSpace.update({
      where: { spaceId },
      data: {
        ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
        ...(input.spaceCode !== undefined ? { spaceCode: input.spaceCode.trim() } : {}),
        ...(input.spaceName !== undefined ? { spaceName: input.spaceName?.trim() || null } : {}),
        ...(input.spaceType !== undefined ? { spaceType: input.spaceType } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.memo !== undefined ? { memo: input.memo?.trim() || null } : {}),
      },
    });

    const deactivated = current.isActive && updated.isActive === false;
    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: deactivated
        ? AUDIT_ACTIONS.PARKING_SPACE_DEACTIVATE
        : AUDIT_ACTIONS.PARKING_SPACE_UPDATE,
      targetType: AUDIT_TARGETS.PARKING_SPACE,
      targetId: spaceId,
      detail: {
        spaceCode: updated.spaceCode,
        before: {
          spaceType: current.spaceType,
          isActive: current.isActive,
          displayOrder: current.displayOrder,
        },
        after: {
          spaceType: updated.spaceType,
          isActive: updated.isActive,
          displayOrder: updated.displayOrder,
        },
      },
      context: actor.requestContext,
    });

    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(
        '같은 구역에 이미 존재하는 주차면 코드입니다.',
        'DUPLICATE_SPACE_CODE',
      );
    }
    throw error;
  }
}
