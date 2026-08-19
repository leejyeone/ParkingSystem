import { ReservationStatus, SpaceType } from '@prisma/client';

import { ENTRY_EXIT_MANAGEMENT_ENABLED } from '@/domain/feature-flags';
import { SPACE_OCCUPYING_STATUSES } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { kstDayRangeUtc, parseTimeOfDayToMinutes } from '@/lib/datetime';
import { buildMapImageUrl } from '@/lib/map-image';
import { prisma } from '@/lib/prisma';
import { toReservationListItem, type ReservationListItem } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 관리자 대시보드 데이터.
 *
 * 주차면 현황은 도면 좌표가 아니라 "주차면 코드 기준 목록/표" 로 제공한다.
 * 도면 이미지는 참고용으로만 함께 내려준다.
 */

/**
 * 주차면 상태.
 *  - EMPTY   : 해당 날짜에 배정된 예약이 없음
 *  - RESERVED: 배정된 예약이 있으나 아직 사용 시간이 아님
 *  - IN_USE  : 지금 사용 중
 *
 * IN_USE 판정은 입·출차 관리 사용 여부에 따라 다르다.
 *  - 사용할 때: 실제 입차 처리된(PARKING) 예약이 있을 때
 *  - 사용하지 않을 때: 입차 기록이 없으므로 현재 시각이 예약 시간대 안에 있으면 사용 중으로 본다
 */
export type SpaceOccupancyStatus = 'EMPTY' | 'RESERVED' | 'IN_USE';

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
  status: SpaceOccupancyStatus;
  /** 지금 사용 중인 예약 ID. 화면에서 해당 시간 행에만 "사용 중" 표시를 붙인다. */
  inUseReservationId: number | null;
};

export type HourlyUsage = { hour: number; usedCount: number };

export type DashboardData = {
  date: string;
  /** 주차면 배정 기능 사용 여부. false 면 화면에서 주차면 관련 영역을 감춘다. */
  spaceAssignmentEnabled: boolean;
  /** 선택한 날짜에 걸치는 주차 예약(승인/입차) 건수. 배정을 쓰지 않을 때의 사용량 지표. */
  dayReservationCount: number;
  /** 최대 주차 가능 대수(시스템 설정). 주차면 배정을 쓰지 않을 때의 정원. */
  parkingCapacity: number;
  /** 당일 시간대별 최대 동시 주차 대수. 정원 대비 얼마나 찼는지 보는 값. */
  peakConcurrentCount: number;
  normalUsedCount: number;
  normalTotalCount: number;
  doubleUsedCount: number;
  doubleTotalCount: number;
  /** 선택한 날짜에 걸치는 승인 대기 건수 */
  pendingCount: number;
  /** 날짜와 무관한 전체 승인 대기 건수. 다른 날짜 신청을 놓치지 않도록 함께 보여준다. */
  pendingTotalCount: number;
  mapImageUrls: { areaName: string; mapImageUrl: string }[];
  spaces: SpaceStatusRow[];
  pendingReservations: ReservationListItem[];
  hourlyUsage: HourlyUsage[];
  operatingHours: { open: string; close: string };
};

export async function getDashboardData(dateString: string): Promise<DashboardData> {
  const settings = await getSystemSettings();
  const spaceAssignmentEnabled = settings.spaceAssignmentEnabled;
  const { start, end } = kstDayRangeUtc(dateString, settings.appTimeZone);

  const [areas, spaces, dayReservations, pendingReservations, pendingTotalCount] =
    await Promise.all([
      prisma.parkingArea.findMany({
        where: { isActive: true, mapImageData: { not: null } },
        select: { areaId: true, areaName: true, mapImageUpdatedAt: true },
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
          // 배정을 쓰지 않으면 주차면이 없는 예약도 "당일 주차 차량" 으로 세야 한다.
          ...(spaceAssignmentEnabled ? { assignedSpaceId: { not: null } } : {}),
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
          assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
        },
        orderBy: [{ visitStartAt: 'asc' }, { reservationId: 'asc' }],
      }),
      // 날짜 필터 없이 전체 승인 대기 건수를 센다.
      prisma.parkingReservation.count({
        where: { reservationStatus: ReservationStatus.REQUESTED },
      }),
    ]);

  const nowMs = Date.now();
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

  const spaceRows: SpaceStatusRow[] = spaces.map((space) => {
    // 조회 결과는 visitStartAt 오름차순이므로 첫 항목이 가장 이른 예약이다.
    const occupancies = bySpace.get(space.spaceId) ?? [];
    const inUse = occupancies.find((occupancy) =>
      ENTRY_EXIT_MANAGEMENT_ENABLED
        ? occupancy.reservationStatus === ReservationStatus.PARKING
        : occupancy.visitStartAt.getTime() <= nowMs && occupancy.visitEndAt.getTime() > nowMs,
    );
    const status: SpaceOccupancyStatus = inUse
      ? 'IN_USE'
      : occupancies.length > 0
        ? 'RESERVED'
        : 'EMPTY';
    return {
      spaceId: space.spaceId,
      spaceCode: space.spaceCode,
      spaceName: space.spaceName,
      spaceType: space.spaceType,
      areaName: space.area.areaName,
      isActive: space.isActive,
      memo: space.memo,
      occupancies,
      status,
      inUseReservationId: inUse?.reservationId ?? null,
    };
  });

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
    spaceAssignmentEnabled,
    dayReservationCount: dayReservations.length,
    parkingCapacity: settings.parkingCapacity,
    peakConcurrentCount: Math.max(0, ...hourlyUsage.map((slot) => slot.usedCount)),
    normalUsedCount: normalSpaces.filter((row) => row.occupancies.length > 0).length,
    normalTotalCount: normalSpaces.length,
    doubleUsedCount: doubleSpaces.filter((row) => row.occupancies.length > 0).length,
    doubleTotalCount: doubleSpaces.length,
    pendingCount: pendingReservations.length,
    pendingTotalCount,
    mapImageUrls: areas.map((area) => ({
      areaName: area.areaName,
      mapImageUrl: buildMapImageUrl(area.areaId, area.mapImageUpdatedAt),
    })),
    spaces: spaceRows,
    pendingReservations: pendingReservations.map(toReservationListItem),
    hourlyUsage,
    operatingHours: { open: settings.parkingOpenTime, close: settings.parkingCloseTime },
  };
}
