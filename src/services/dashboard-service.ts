import { ReservationStatus, SpaceType } from '@prisma/client';

import { SPACE_OCCUPYING_STATUSES } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { kstDayRangeUtc, parseTimeOfDayToMinutes, todayKstDateString } from '@/lib/datetime';
import { prisma } from '@/lib/prisma';
import { countUnresolvedFailedEmails } from '@/services/log-query-service';
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
  areaId: number;
  areaCode: string;
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
  /** 이 주차면이 법인 공용 차량 전용으로 고정 배정되어 있으면 채워진다. 평면도에서 다른 색으로 표시한다. */
  companyVehicle: { vehicleId: number; vehicleNo: string } | null;
  /**
   * 이 주차면에 고정 배정된 법인 차량의, 선택한 날짜에 걸치는 운행 신청. 배정 전(REQUESTED,
   * 아직 어느 차를 내줄지 정해지지 않은 신청)은 특정 주차면과 연결할 수 없으므로 포함하지
   * 않는다 — `companyVehiclePendingCount`로 별도 노출한다.
   */
  companyVehicleTrips: {
    tripId: number;
    tripStatus: ReservationStatus;
    requestStartAt: Date;
    requestEndAt: Date;
    requesterName: string;
    departmentName: string;
  }[];
};

export type HourlyUsage = { hour: number; usedCount: number };

/** 대시보드 "법인차량 승인 대기 목록" 카드용 — 날짜와 무관한 전체 대기 신청 한 건. */
export type PendingCompanyVehicleTripItem = {
  tripId: number;
  tripNo: string | null;
  destination: string;
  reason: string;
  requesterName: string;
  departmentName: string;
  requestStartAt: Date;
  requestEndAt: Date;
};

export type DashboardData = {
  date: string;
  /** 주차면 배정 기능 사용 여부. false 면 화면에서 주차면 관련 영역을 감춘다. */
  spaceAssignmentEnabled: boolean;
  /** 이중주차 사용 여부. false 면 이중주차 사용 현황 대신 당일 예약 차량 수를 보여준다. */
  doubleParkingEnabled: boolean;
  /** 선택한 날짜에 걸치는 방문 예약(승인/입차) 건수. 배정을 쓰지 않을 때의 사용량 지표. */
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
  /** 발송 실패한 이메일 건수(날짜 무관, 전체). 신청자에게 안내 메일이 못 갔을 수 있어 경고로 띄운다. */
  failedEmailCount: number;
  /** 승인 대기 중인 법인차량 신청 건수(날짜 무관, 전체). */
  companyVehiclePendingCount: number;
  /** 승인 대기 중인 법인차량 신청 목록(날짜 무관, 전체, 운행 예정 임박순). */
  companyVehiclePendingTrips: PendingCompanyVehicleTripItem[];
  /**
   * 오늘 접수된 신규 신청 건수(방문 예약 + 법인차량, 반복 예약의 개별 일정 제외).
   * 화면에서 조회 중인 날짜(dateString)와 무관하게 항상 서버 기준 오늘 값이다.
   */
  todayNewRequestCount: number;
  spaces: SpaceStatusRow[];
  /** 구역별로 묶은 주차면 현황. 대시보드 평면도 카드의 층 탭에서 쓴다. */
  areas: { areaId: number; areaCode: string; areaName: string; spaces: SpaceStatusRow[] }[];
  pendingReservations: ReservationListItem[];
  hourlyUsage: HourlyUsage[];
  operatingHours: { open: string; close: string };
  /** 대시보드 자동 새로고침 주기(분). 시스템 설정에서 관리자가 바꿀 수 있다. */
  dashboardRefreshIntervalMinutes: number;
  /**
   * 이 데이터를 계산한 시각(ms). "입차 예정" 배지처럼 지금 시각과 비교해야 하는 화면
   * 판정에 쓴다 — 서버 컴포넌트 렌더 중에 Date.now() 를 직접 부르면 impure 로 취급되므로
   * 데이터 계산 시점에 한 번 구해서 내려준다.
   */
  nowMs: number;
};

export async function getDashboardData(dateString: string): Promise<DashboardData> {
  const settings = await getSystemSettings();
  const spaceAssignmentEnabled = settings.spaceAssignmentEnabled;
  const { start, end } = kstDayRangeUtc(dateString, settings.appTimeZone);
  // "오늘 신규 신청" 은 화면에서 조회 중인 날짜(dateString)와 무관하게 항상 서버 기준
  // 오늘 하루 접수된 건수다 — 다른 날짜를 조회해도 값이 바뀌지 않는다.
  const todayRange = kstDayRangeUtc(todayKstDateString(new Date(), settings.appTimeZone), settings.appTimeZone);

  const [
    spaces,
    dayReservations,
    dayCompanyVehicleTrips,
    pendingReservations,
    pendingTotalCount,
    failedEmailCount,
    companyVehiclePendingTrips,
    todayNewReservationCount,
    todayNewCompanyVehicleTripCount,
  ] = await Promise.all([
      prisma.parkingSpace.findMany({
        // 비활성 주차면도 도면에 회색으로 표시해야 하므로 함께 가져온다.
        where: { area: { isActive: true } },
        // 구역별로 묶어 탭을 만들 수 있도록 구역 표시 순서를 먼저 따르고, 그 안에서는
        // 주차면 코드 순서로 정렬한다.
        orderBy: [{ area: { displayOrder: 'asc' } }, { spaceCode: 'asc' }],
        select: {
          spaceId: true,
          spaceCode: true,
          spaceName: true,
          spaceType: true,
          isActive: true,
          memo: true,
          area: { select: { areaId: true, areaCode: true, areaName: true } },
          companyVehicle: { select: { vehicleId: true, vehicleNo: true, isActive: true } },
        },
      }),
      prisma.parkingReservation.findMany({
        where: {
          // 출차 완료(EXITED)도 그날의 이용 기록으로 계속 보이게 포함한다. 다만 "지금 사용
          // 중/예약됨" 판정(status)과 사용 대수 집계는 아래에서 EXITED 를 제외하고 따로 계산한다.
          reservationStatus: { in: [...SPACE_OCCUPYING_STATUSES, ReservationStatus.EXITED] },
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
      // 법인차량 주차면의 "상태" 열도 방문 예약과 같은 방식(신청된 시간대)으로 보여주기
      // 위해 선택한 날짜에 걸치는 운행 신청을 가져온다. 승인 전(REQUESTED)은 아직 어느
      // 차량을 내줄지 정해지지 않아 특정 주차면과 연결할 수 없으므로 뺀다.
      prisma.companyVehicleTrip.findMany({
        where: {
          assignedVehicleId: { not: null },
          tripStatus: { in: [...SPACE_OCCUPYING_STATUSES, ReservationStatus.EXITED] },
          requestStartAt: { lt: end },
          requestEndAt: { gt: start },
        },
        select: {
          tripId: true,
          tripStatus: true,
          requestStartAt: true,
          requestEndAt: true,
          assignedVehicleId: true,
          employee: { select: { name: true, departmentName: true } },
        },
        orderBy: { requestStartAt: 'asc' },
      }),
      prisma.parkingReservation.findMany({
        where: { reservationStatus: ReservationStatus.REQUESTED, ...buildOverlapWhere(start, end) },
        include: {
          assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
          employeeUser: { select: { name: true, email: true, departmentName: true } },
          recurringSchedule: { select: { scheduleId: true } },
        },
        orderBy: [{ visitStartAt: 'asc' }, { reservationId: 'asc' }],
      }),
      // 날짜 필터 없이 전체 승인 대기 건수를 센다.
      prisma.parkingReservation.count({
        where: { reservationStatus: ReservationStatus.REQUESTED },
      }),
      // 날짜 필터 없이, 아직 해결되지 않은 발송 실패 건수를 센다.
      countUnresolvedFailedEmails(),
      // 날짜 필터 없이 전체 법인차량 승인 대기 목록을 가져온다(대시보드 목록 카드용).
      // 처리 큐이므로 운행 예정 시각이 임박한 순으로 — 방문 예약 "승인 대기 목록"
      // (visitStartAt asc)과 같은 원칙.
      prisma.companyVehicleTrip.findMany({
        where: { tripStatus: ReservationStatus.REQUESTED },
        include: { employee: { select: { name: true, departmentName: true } } },
        orderBy: { requestStartAt: 'asc' },
      }),
      // 오늘 접수된(생성된) 방문 예약 건수 — 반복 예약에서 매번 새로 생기는 개별 일정은
      // 신규 "신청"이 아니라 기존 시리즈의 결과물이므로 제외한다.
      prisma.parkingReservation.count({
        where: {
          createdAt: { gte: todayRange.start, lt: todayRange.end },
          recurringScheduleId: null,
        },
      }),
      prisma.companyVehicleTrip.count({
        where: { createdAt: { gte: todayRange.start, lt: todayRange.end } },
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

  // 법인차량은 주차면이 아니라 차량(assignedVehicleId) 기준으로 묶여 있으므로,
  // 그 차량이 고정 배정된 주차면을 찾을 때는 아래에서 vehicleId 로 조회한다.
  const tripsByVehicle = new Map<number, SpaceStatusRow['companyVehicleTrips']>();
  for (const trip of dayCompanyVehicleTrips) {
    if (trip.assignedVehicleId === null) continue;
    const list = tripsByVehicle.get(trip.assignedVehicleId) ?? [];
    list.push({
      tripId: trip.tripId,
      tripStatus: trip.tripStatus,
      requestStartAt: trip.requestStartAt,
      requestEndAt: trip.requestEndAt,
      requesterName: trip.employee.name,
      departmentName: trip.employee.departmentName,
    });
    tripsByVehicle.set(trip.assignedVehicleId, list);
  }

  const spaceRows: SpaceStatusRow[] = spaces.map((space) => {
    // 조회 결과는 visitStartAt 오름차순이므로 첫 항목이 가장 이른 예약이다.
    const occupancies = bySpace.get(space.spaceId) ?? [];
    // 출차 완료(EXITED)는 표시는 계속하되, "지금 사용 중/예약됨" 판정에서는 뺀다 —
    // 이미 나간 차 때문에 자리가 계속 "사용 중"으로 보이면 안 된다.
    const activeOccupancies = occupancies.filter(
      (occupancy) => occupancy.reservationStatus !== ReservationStatus.EXITED,
    );
    const inUse = activeOccupancies.find((occupancy) =>
      settings.entryExitManagementEnabled
        ? occupancy.reservationStatus === ReservationStatus.PARKING
        : occupancy.visitStartAt.getTime() <= nowMs && occupancy.visitEndAt.getTime() > nowMs,
    );
    const status: SpaceOccupancyStatus = inUse
      ? 'IN_USE'
      : activeOccupancies.length > 0
        ? 'RESERVED'
        : 'EMPTY';
    // 이중주차 사용을 꺼 두면 DOUBLE 주차면은 배정 후보에서도 이미 빠지므로(space-assignment-service),
    // 화면에서도 실제로 쓸 수 없다는 걸 그대로 보여준다. 관리자가 개별 주차면마다 비활성 처리를
    // 해 두지 않아도 설정 하나로 즉시 반영되도록 DB 값을 건드리지 않고 조회 시점에만 겹쳐 계산한다
    // (실측 isActive 는 "이 자리가 물리적으로 존재하는지"를 나타내는 별개의 값으로 보존한다).
    const isActive =
      space.isActive && (space.spaceType !== SpaceType.DOUBLE || settings.doubleParkingEnabled);
    return {
      spaceId: space.spaceId,
      spaceCode: space.spaceCode,
      spaceName: space.spaceName,
      spaceType: space.spaceType,
      areaId: space.area.areaId,
      areaCode: space.area.areaCode,
      areaName: space.area.areaName,
      isActive,
      memo: space.memo,
      occupancies,
      status,
      inUseReservationId: inUse?.reservationId ?? null,
      companyVehicle:
        space.companyVehicle && space.companyVehicle.isActive
          ? { vehicleId: space.companyVehicle.vehicleId, vehicleNo: space.companyVehicle.vehicleNo }
          : null,
      companyVehicleTrips:
        space.companyVehicle && space.companyVehicle.isActive
          ? (tripsByVehicle.get(space.companyVehicle.vehicleId) ?? [])
          : [],
    };
  });

  // 구역별로 묶는다. 쿼리가 이미 구역 표시 순서로 정렬돼 있어 순서만 보존하면 된다.
  const areaMap = new Map<
    number,
    { areaId: number; areaCode: string; areaName: string; spaces: SpaceStatusRow[] }
  >();
  for (const row of spaceRows) {
    const area = areaMap.get(row.areaId);
    if (area) {
      area.spaces.push(row);
    } else {
      areaMap.set(row.areaId, {
        areaId: row.areaId,
        areaCode: row.areaCode,
        areaName: row.areaName,
        spaces: [row],
      });
    }
  }
  const areas = [...areaMap.values()];

  // 사용량 집계는 실제로 쓸 수 있는(활성) 주차면만 센다. 법인차량이 배정된 자리는 다른 차가
  // 절대 못 쓰므로(방문 예약이 잡히지 않아 status 가 항상 EMPTY) — 다른 차가 쓸 수 있는
  // 여유 자리가 아니라 "사용 불가"에 가깝다. 주차 평면도 범례가 이미 같은 원칙으로 법인차량
  // 자리를 사용가능/예약·사용중/비활성 어디에도 넣지 않는 것과 맞춰, 여기서도 아예 뺀다.
  const activeSpaces = spaceRows.filter((row) => row.isActive && !row.companyVehicle);
  const normalSpaces = activeSpaces.filter((row) => row.spaceType === SpaceType.NORMAL);
  const doubleSpaces = activeSpaces.filter((row) => row.spaceType === SpaceType.DOUBLE);

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
    doubleParkingEnabled: settings.doubleParkingEnabled,
    dayReservationCount: dayReservations.length,
    parkingCapacity: settings.parkingCapacity,
    peakConcurrentCount: Math.max(0, ...hourlyUsage.map((slot) => slot.usedCount)),
    // 출차 완료(EXITED)만 있는 자리는 이미 비었으므로 "사용 중"에서 뺀다(status 기준).
    normalUsedCount: normalSpaces.filter((row) => row.status !== 'EMPTY').length,
    normalTotalCount: normalSpaces.length,
    doubleUsedCount: doubleSpaces.filter((row) => row.status !== 'EMPTY').length,
    doubleTotalCount: doubleSpaces.length,
    pendingCount: pendingReservations.length,
    pendingTotalCount,
    failedEmailCount,
    todayNewRequestCount: todayNewReservationCount + todayNewCompanyVehicleTripCount,
    companyVehiclePendingCount: companyVehiclePendingTrips.length,
    companyVehiclePendingTrips: companyVehiclePendingTrips.map((trip) => ({
      tripId: trip.tripId,
      tripNo: trip.tripNo,
      destination: trip.destination,
      reason: trip.reason,
      requesterName: trip.employee.name,
      departmentName: trip.employee.departmentName,
      requestStartAt: trip.requestStartAt,
      requestEndAt: trip.requestEndAt,
    })),
    spaces: spaceRows,
    areas,
    pendingReservations: pendingReservations.map((r) =>
      toReservationListItem(r, settings.entryExitManagementEnabled),
    ),
    hourlyUsage,
    operatingHours: { open: settings.parkingOpenTime, close: settings.parkingCloseTime },
    dashboardRefreshIntervalMinutes: settings.dashboardRefreshIntervalMinutes,
    nowMs,
  };
}
