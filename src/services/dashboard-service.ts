import { ReservationStatus, SpaceType } from '@prisma/client';

import { SPACE_OCCUPYING_STATUSES } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { kstDayRangeUtc, parseTimeOfDayToMinutes } from '@/lib/datetime';
import { prisma } from '@/lib/prisma';
import { toReservationListItem, type ReservationListItem } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 관리자 대시보드 데이터.
 *
 * 주차면 현황은 도면 좌표가 아니라 "주차면 코드 기준 목록/표" 로 제공한다.
 * 도면 이미지는 참고용으로만 함께 내려준다.
 */

export type SpaceStatusRow = {
  spaceId: number;
  spaceCode: string;
  spaceName: string | null;
  spaceType: SpaceType;
  areaName: string;
  isActive: boolean;
  memo: string | null;
  occupancies: {
    reservationId: number;
    reservationNo: string;
    reservationStatus: ReservationStatus;
    vehicleNo: string;
    visitStartAt: Date;
    visitEndAt: Date;
  }[];
};

export type HourlyUsage = { hour: number; usedCount: number };

export type DashboardData = {
  date: string;
  normalUsedCount: number;
  normalTotalCount: number;
  doubleUsedCount: number;
  doubleTotalCount: number;
  pendingCount: number;
  mapImageUrls: { areaName: string; mapImageUrl: string }[];
  spaces: SpaceStatusRow[];
  pendingReservations: ReservationListItem[];
  hourlyUsage: HourlyUsage[];
  operatingHours: { open: string; close: string };
};

export async function getDashboardData(dateString: string): Promise<DashboardData> {
  const settings = await getSystemSettings();
  const { start, end } = kstDayRangeUtc(dateString, settings.appTimeZone);

  const [areas, spaces, dayReservations, pendingReservations] = await Promise.all([
    prisma.parkingArea.findMany({
      where: { isActive: true, mapImageUrl: { not: null } },
      select: { areaName: true, mapImageUrl: true },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.parkingSpace.findMany({
      where: { isActive: true, area: { isActive: true } },
      orderBy: [{ displayOrder: 'asc' }, { spaceId: 'asc' }],
      select: {
        spaceId: true,
        spaceCode: true,
        spaceName: true,
        spaceType: true,
        isActive: true,
        memo: true,
        area: { select: { areaName: true } },
      },
    }),
    prisma.parkingReservation.findMany({
      where: {
        reservationStatus: { in: [...SPACE_OCCUPYING_STATUSES] },
        assignedSpaceId: { not: null },
        ...buildOverlapWhere(start, end),
      },
      select: {
        reservationId: true,
        reservationNo: true,
        reservationStatus: true,
        vehicleNo: true,
        visitStartAt: true,
        visitEndAt: true,
        assignedSpaceId: true,
      },
      orderBy: { visitStartAt: 'asc' },
    }),
    prisma.parkingReservation.findMany({
      where: { reservationStatus: ReservationStatus.REQUESTED, ...buildOverlapWhere(start, end) },
      include: {
        recommendedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
        assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
      },
      orderBy: [{ visitStartAt: 'asc' }, { reservationId: 'asc' }],
    }),
  ]);

  const bySpace = new Map<number, SpaceStatusRow['occupancies']>();
  for (const reservation of dayReservations) {
    if (reservation.assignedSpaceId === null) continue;
    const list = bySpace.get(reservation.assignedSpaceId) ?? [];
    list.push({
      reservationId: reservation.reservationId,
      reservationNo: reservation.reservationNo,
      reservationStatus: reservation.reservationStatus,
      vehicleNo: reservation.vehicleNo,
      visitStartAt: reservation.visitStartAt,
      visitEndAt: reservation.visitEndAt,
    });
    bySpace.set(reservation.assignedSpaceId, list);
  }

  const spaceRows: SpaceStatusRow[] = spaces.map((space) => ({
    spaceId: space.spaceId,
    spaceCode: space.spaceCode,
    spaceName: space.spaceName,
    spaceType: space.spaceType,
    areaName: space.area.areaName,
    isActive: space.isActive,
    memo: space.memo,
    occupancies: bySpace.get(space.spaceId) ?? [],
  }));

  const normalSpaces = spaceRows.filter((row) => row.spaceType === SpaceType.NORMAL);
  const doubleSpaces = spaceRows.filter((row) => row.spaceType === SpaceType.DOUBLE);

  const openMinutes = parseTimeOfDayToMinutes(settings.parkingOpenTime);
  const closeMinutes = parseTimeOfDayToMinutes(settings.parkingCloseTime);
  const hourlyUsage: HourlyUsage[] = [];
  for (let hour = Math.floor(openMinutes / 60); hour < Math.ceil(closeMinutes / 60); hour += 1) {
    const slotStart = new Date(start.getTime() + hour * 3_600_000);
    const slotEnd = new Date(slotStart.getTime() + 3_600_000);
    const usedCount = dayReservations.filter(
      (reservation) =>
        reservation.visitStartAt.getTime() < slotEnd.getTime() &&
        reservation.visitEndAt.getTime() > slotStart.getTime(),
    ).length;
    hourlyUsage.push({ hour, usedCount });
  }

  return {
    date: dateString,
    normalUsedCount: normalSpaces.filter((row) => row.occupancies.length > 0).length,
    normalTotalCount: normalSpaces.length,
    doubleUsedCount: doubleSpaces.filter((row) => row.occupancies.length > 0).length,
    doubleTotalCount: doubleSpaces.length,
    pendingCount: pendingReservations.length,
    mapImageUrls: areas
      .filter(
        (area): area is { areaName: string; mapImageUrl: string } => area.mapImageUrl !== null,
      )
      .map((area) => ({ areaName: area.areaName, mapImageUrl: area.mapImageUrl })),
    spaces: spaceRows,
    pendingReservations: pendingReservations.map(toReservationListItem),
    hourlyUsage,
    operatingHours: { open: settings.parkingOpenTime, close: settings.parkingCloseTime },
  };
}
