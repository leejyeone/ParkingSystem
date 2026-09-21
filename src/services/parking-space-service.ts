import { Prisma, SpaceType } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 주차 구역 / 주차면 관리 */

export async function listParkingAreas() {
  return prisma.parkingArea.findMany({
    orderBy: [{ displayOrder: 'asc' }, { areaId: 'asc' }],
    select: {
      areaId: true,
      areaCode: true,
      areaName: true,
      description: true,
      displayOrder: true,
      isActive: true,
      mapImageMimeType: true,
      mapImageName: true,
      mapImageUpdatedAt: true,
    },
  });
}

export async function listParkingSpaces(
  options: { includeInactive?: boolean; excludeCompanyVehicleAssigned?: boolean } = {},
) {
  return prisma.parkingSpace.findMany({
    where: {
      ...(options.includeInactive ? {} : { isActive: true }),
      // 법인차량이 고정 배정해 방문 예약 쪽에서는 못 쓰는 주차면을 뺀다 — 방문 예약
      // 승인 화면의 findFirstAvailableSpace(space-assignment-service.ts)와 같은 기준.
      ...(options.excludeCompanyVehicleAssigned
        ? { OR: [{ companyVehicle: null }, { companyVehicle: { isActive: false } }] }
        : {}),
    },
    // 대시보드·배정 드롭다운과 같은 기준: 구역 표시 순서(지하 1층 -> 지상 1층)를 먼저
    // 따르고, 그 안에서 주차면 코드 순으로 정렬한다.
    orderBy: [{ area: { displayOrder: 'asc' } }, { spaceCode: 'asc' }],
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
  /** 화면에 노출하지 않는 내부 구분자. 비우면 자동 생성한다. */
  areaCode?: string | null;
  areaName: string;
  description?: string | null;
  /** 화면에 노출하지 않는 내부 정렬값. 비우면 마지막 순서로 붙인다. */
  displayOrder?: number;
  isActive?: boolean;
};

/**
 * 구역 코드와 정렬 순서는 화면에서 입력받지 않는다(내부 구분용).
 * 코드는 AREA-001 형태로, 정렬은 마지막 순서로 자동 부여한다.
 */
async function nextAreaDefaults(): Promise<{ areaCode: string; displayOrder: number }> {
  const last = await prisma.parkingArea.findFirst({
    orderBy: { areaId: 'desc' },
    select: { areaId: true },
  });
  const maxOrder = await prisma.parkingArea.aggregate({ _max: { displayOrder: true } });
  const nextId = (last?.areaId ?? 0) + 1;
  return {
    areaCode: `AREA-${String(nextId).padStart(3, '0')}`,
    displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
  };
}

/** 주차면 정렬 순서도 화면에서 받지 않는다. 같은 구역의 마지막 순서 다음으로 붙인다. */
async function nextSpaceDisplayOrder(areaId: number): Promise<number> {
  const maxOrder = await prisma.parkingSpace.aggregate({
    where: { areaId },
    _max: { displayOrder: true },
  });
  return (maxOrder._max.displayOrder ?? 0) + 1;
}

export async function createParkingArea(
  input: ParkingAreaInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const defaults = await nextAreaDefaults();

  try {
    const created = await prisma.parkingArea.create({
      data: {
        areaCode: input.areaCode?.trim().toUpperCase() || defaults.areaCode,
        areaName: input.areaName.trim(),
        description: input.description?.trim() || null,
        displayOrder: input.displayOrder ?? defaults.displayOrder,
        isActive: input.isActive ?? true,
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
  /** 화면에 노출하지 않는 내부 정렬값. 비우면 같은 구역의 마지막 순서로 붙인다. */
  displayOrder?: number;
  isActive?: boolean;
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
        displayOrder: input.displayOrder ?? (await nextSpaceDisplayOrder(input.areaId)),
        isActive: input.isActive ?? true,
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

/**
 * 주차면 삭제. (소프트 삭제 — isActive 를 false 로 바꾸고 행은 남긴다)
 *
 * 실제로 지우지 않는다. FK 가 onDelete: SetNull 이라 물리 삭제하면 과거 예약의
 * 배정 이력이 조용히 사라지기 때문에, 예약에 쓰인 적이 있든 없든 항상 비활성화로
 * 처리한다.
 */
export async function deleteParkingSpace(
  spaceId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.parkingSpace.findUnique({
    where: { spaceId },
    select: { spaceId: true, spaceCode: true, spaceType: true },
  });
  if (!current) throw new NotFoundError('주차면을 찾을 수 없습니다.');

  await prisma.parkingSpace.update({ where: { spaceId }, data: { isActive: false } });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.PARKING_SPACE_DELETE,
    targetType: AUDIT_TARGETS.PARKING_SPACE,
    targetId: spaceId,
    detail: { spaceCode: current.spaceCode, spaceType: current.spaceType },
    context: actor.requestContext,
  });

  return { spaceId };
}

// ---------------------------------------------------------------------------
// 도면 이미지 (parking_areas.map_image_*)
//
// 파일 자체를 DB 에 보관한다. 별도 스토리지나 업로드 디렉터리를 두지 않아
// 배포 환경마다 경로·권한을 맞출 필요가 없고, DB 백업에 도면이 함께 포함된다.
// ---------------------------------------------------------------------------

export async function getParkingAreaMapImage(
  areaId: number,
): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string } | null> {
  const area = await prisma.parkingArea.findUnique({
    where: { areaId },
    select: { mapImageData: true, mapImageMimeType: true },
  });

  if (!area?.mapImageData || !area.mapImageMimeType) return null;
  return { data: area.mapImageData, mimeType: area.mapImageMimeType };
}

export async function saveParkingAreaMapImage(
  areaId: number,
  file: { data: Uint8Array<ArrayBuffer>; mimeType: string; fileName: string },
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const area = await prisma.parkingArea.findUnique({
    where: { areaId },
    select: { areaId: true, areaName: true },
  });
  if (!area) throw new NotFoundError('주차 구역을 찾을 수 없습니다.');

  const updated = await prisma.parkingArea.update({
    where: { areaId },
    data: {
      mapImageData: file.data,
      mapImageMimeType: file.mimeType,
      mapImageName: file.fileName.slice(0, 255),
      mapImageUpdatedAt: new Date(),
    },
    select: { areaId: true, mapImageName: true, mapImageUpdatedAt: true },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.PARKING_AREA_UPDATE,
    targetType: AUDIT_TARGETS.PARKING_AREA,
    targetId: areaId,
    detail: {
      areaName: area.areaName,
      mapImage: 'UPLOADED',
      fileName: updated.mapImageName,
      byteSize: file.data.length,
      mimeType: file.mimeType,
    },
    context: actor.requestContext,
  });

  return updated;
}

export async function clearParkingAreaMapImage(
  areaId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const area = await prisma.parkingArea.findUnique({
    where: { areaId },
    select: { areaId: true, areaName: true },
  });
  if (!area) throw new NotFoundError('주차 구역을 찾을 수 없습니다.');

  await prisma.parkingArea.update({
    where: { areaId },
    data: {
      mapImageData: null,
      mapImageMimeType: null,
      mapImageName: null,
      mapImageUpdatedAt: null,
    },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.PARKING_AREA_UPDATE,
    targetType: AUDIT_TARGETS.PARKING_AREA,
    targetId: areaId,
    detail: { areaName: area.areaName, mapImage: 'REMOVED' },
    context: actor.requestContext,
  });
}
