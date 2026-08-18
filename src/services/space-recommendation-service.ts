import { Prisma, SpaceType } from '@prisma/client';

import { SPACE_OCCUPYING_STATUSES } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export type RecommendableSpace = {
  spaceId: number;
  spaceCode: string;
  spaceType: SpaceType;
  displayOrder: number;
};

/**
 * 자동 주차면 추천.
 *
 * 규칙(요구사항 5-4)
 *  1. 활성 NORMAL 주차면을 먼저 조회한다.
 *  2. 해당 시간대에 APPROVED/PARKING 예약과 겹치지 않는 주차면만 후보로 둔다.
 *  3. 후보 중 display_order 오름차순 첫 번째를 추천한다.
 *  4. 일반 주차면이 없을 때만 DOUBLE 주차면을 조회한다.
 *  5. DOUBLE 도 display_order 오름차순으로 추천한다.
 *  6. 추천 가능한 위치가 없으면 null 을 반환한다.
 *
 * 사용자는 주차 위치를 선택할 수 없으며, 이 값은 어디까지나 "추천" 이다.
 * 최종 확정은 관리자 승인 시점에 이루어진다.
 */
export async function recommendSpace(
  params: {
    visitStartAt: Date;
    visitEndAt: Date;
    /** 수정 시 자기 자신을 후보 계산에서 제외 */
    excludeReservationId?: number;
    /** 이중주차 사용 여부 (시스템 설정) */
    doubleParkingEnabled: boolean;
  },
  db: Db = prisma,
): Promise<RecommendableSpace | null> {
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
): Promise<RecommendableSpace | null> {
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
): Promise<(RecommendableSpace & { areaName: string; available: boolean })[]> {
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
