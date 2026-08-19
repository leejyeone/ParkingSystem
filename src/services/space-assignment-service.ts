import { Prisma, SpaceType } from '@prisma/client';

import { SPACE_OCCUPYING_STATUSES } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export type AssignableSpace = {
  spaceId: number;
  spaceCode: string;
  spaceType: SpaceType;
  displayOrder: number;
};

/**
 * 해당 시간대에 배정할 수 있는 주차면 한 곳을 고른다.
 *
 * 규칙(요구사항 5-4)
 *  1. 활성 NORMAL 주차면을 먼저 조회한다.
 *  2. 해당 시간대에 APPROVED/PARKING 예약과 겹치지 않는 주차면만 후보로 둔다.
 *  3. 후보 중 display_order 오름차순 첫 번째를 고른다.
 *  4. 일반 주차면이 없을 때만 DOUBLE 주차면을 조회한다.
 *  5. DOUBLE 도 display_order 오름차순으로 고른다.
 *  6. 배정할 수 있는 위치가 없으면 null 을 반환한다.
 *  7. 시스템 설정에서 주차면 배정을 껐다면 항상 null 을 반환한다.
 *
 * 결과는 저장하지 않는다. 필요한 시점(상세 화면 진입, 승인 처리)에 매번 계산해야
 * 그 사이 다른 예약이 자리를 차지한 상황이 반영된다.
 */
export async function pickAvailableSpace(
  params: {
    visitStartAt: Date;
    visitEndAt: Date;
    /** 수정 시 자기 자신을 후보 계산에서 제외 */
    excludeReservationId?: number;
    /** 이중주차 사용 여부 (시스템 설정) */
    doubleParkingEnabled: boolean;
    /** 주차면 배정 기능 사용 여부 (시스템 설정). false 면 고르지 않는다. */
    spaceAssignmentEnabled?: boolean;
  },
  db: Db = prisma,
): Promise<AssignableSpace | null> {
  if (params.spaceAssignmentEnabled === false) return null;

  const occupiedSpaceIds = await findOccupiedSpaceIds(params, db);

  const normal = await findFirstAvailableSpace(SpaceType.NORMAL, occupiedSpaceIds, db);
  if (normal) return normal;

  if (!params.doubleParkingEnabled) return null;

  return findFirstAvailableSpace(SpaceType.DOUBLE, occupiedSpaceIds, db);
}

/** 해당 시간대에 이미 점유(APPROVED/PARKING)된 주차면 ID 목록 */
export async function findOccupiedSpaceIds(
  params: { visitStartAt: Date; visitEndAt: Date; excludeReservationId?: number },
  db: Db = prisma,
): Promise<number[]> {
  const rows = await db.parkingReservation.findMany({
    where: {
      assignedSpaceId: { not: null },
      reservationStatus: { in: [...SPACE_OCCUPYING_STATUSES] },
      ...buildOverlapWhere(params.visitStartAt, params.visitEndAt),
      ...(params.excludeReservationId
        ? { reservationId: { not: params.excludeReservationId } }
        : {}),
    },
    select: { assignedSpaceId: true },
  });

  return rows
    .map((row) => row.assignedSpaceId)
    .filter((spaceId): spaceId is number => spaceId !== null);
}

async function findFirstAvailableSpace(
  spaceType: SpaceType,
  occupiedSpaceIds: number[],
  db: Db,
): Promise<AssignableSpace | null> {
  return db.parkingSpace.findFirst({
    where: {
      spaceType,
      isActive: true,
      area: { isActive: true },
      ...(occupiedSpaceIds.length > 0 ? { spaceId: { notIn: occupiedSpaceIds } } : {}),
    },
    orderBy: [{ displayOrder: 'asc' }, { spaceId: 'asc' }],
    select: { spaceId: true, spaceCode: true, spaceType: true, displayOrder: true },
  });
}

/**
 * 특정 주차면이 해당 시간대에 이미 점유되어 있는지 확인한다.
 * 승인/위치변경 트랜잭션 내부에서 반드시 다시 호출해 경합을 막는다.
 */
export async function findConflictingReservation(
  params: {
    spaceId: number;
    visitStartAt: Date;
    visitEndAt: Date;
    excludeReservationId?: number;
  },
  db: Db = prisma,
): Promise<{ reservationId: number; reservationNo: string } | null> {
  return db.parkingReservation.findFirst({
    where: {
      assignedSpaceId: params.spaceId,
      reservationStatus: { in: [...SPACE_OCCUPYING_STATUSES] },
      ...buildOverlapWhere(params.visitStartAt, params.visitEndAt),
      ...(params.excludeReservationId
        ? { reservationId: { not: params.excludeReservationId } }
        : {}),
    },
    select: { reservationId: true, reservationNo: true },
  });
}

/** 특정 시간대에 배정 가능한 주차면 목록 (관리자 배정 드롭다운용) */
export async function listAvailableSpaces(
  params: {
    visitStartAt: Date;
    visitEndAt: Date;
    excludeReservationId?: number;
    doubleParkingEnabled: boolean;
  },
  db: Db = prisma,
): Promise<(AssignableSpace & { areaName: string; available: boolean })[]> {
  const occupiedSpaceIds = new Set(await findOccupiedSpaceIds(params, db));

  const types: SpaceType[] = params.doubleParkingEnabled
    ? [SpaceType.NORMAL, SpaceType.DOUBLE, SpaceType.DISABLED, SpaceType.EV]
    : [SpaceType.NORMAL, SpaceType.DISABLED, SpaceType.EV];

  const spaces = await db.parkingSpace.findMany({
    where: { isActive: true, spaceType: { in: types }, area: { isActive: true } },
    orderBy: [{ displayOrder: 'asc' }, { spaceId: 'asc' }],
    select: {
      spaceId: true,
      spaceCode: true,
      spaceType: true,
      displayOrder: true,
      area: { select: { areaName: true } },
    },
  });

  return spaces.map((space) => ({
    spaceId: space.spaceId,
    spaceCode: space.spaceCode,
    spaceType: space.spaceType,
    displayOrder: space.displayOrder,
    areaName: space.area.areaName,
    available: !occupiedSpaceIds.has(space.spaceId),
  }));
}
