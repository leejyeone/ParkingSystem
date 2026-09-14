import { Prisma, type ReservationStatus } from '@prisma/client';

import { formatKstRange } from '@/lib/datetime';
import { prisma } from '@/lib/prisma';

/**
 * 직원 화면(홈 "최근 예약 현황" + "예약 조회")에 쓰는 통합 활동 내역.
 *
 * 방문 예약(본인/대리 신청)과 법인차량 신청은 완전히 다른 테이블이라, 화면에 한
 * 목록으로 섞어 보여주기 위해 이 서비스에서만 공통 모양으로 변환한다.
 */
export type EmployeeActivityKind = 'EMPLOYEE_VISIT' | 'PROXY_VISIT' | 'COMPANY_VEHICLE';

const KIND_LABEL: Record<EmployeeActivityKind, string> = {
  EMPLOYEE_VISIT: '내 방문신청',
  PROXY_VISIT: '방문객 대리 신청',
  COMPANY_VEHICLE: '법인 차량 예약',
};

export type EmployeeActivityItem = {
  /** reservationId 또는 tripId. kind 안에서만 유일하다(표 key 는 `${kind}-${id}` 로 조합). */
  id: number;
  kind: EmployeeActivityKind;
  kindLabel: string;
  no: string;
  requesterName: string;
  vehicleNo: string;
  dateRangeText: string;
  purpose: string;
  status: ReservationStatus;
  href: string;
  sortAt: Date;
};

export type EmployeeActivityFilter = {
  kind?: EmployeeActivityKind;
  status?: ReservationStatus;
  /** 이 구간과 겹치는 건만(방문 예약은 visitStartAt~visitEndAt, 법인차량은 requestStartAt~requestEndAt 기준). */
  dateFrom?: Date;
  dateTo?: Date;
  /** 성명·차량번호·방문 목적(또는 행선지/사유) 부분 일치 검색. */
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type EmployeeActivityCounts = Record<EmployeeActivityKind | 'ALL', number>;

export type EmployeeActivityListResult = {
  items: EmployeeActivityItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: EmployeeActivityCounts;
};

const RESERVATION_SELECT = {
  reservationId: true,
  reservationNo: true,
  requesterType: true,
  requesterName: true,
  vehicleNo: true,
  visitStartAt: true,
  visitEndAt: true,
  visitPurpose: true,
  reservationStatus: true,
  createdAt: true,
} satisfies Prisma.ParkingReservationSelect;

type ReservationRow = Prisma.ParkingReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

function reservationWhere(
  employeeUserId: number,
  requesterType: 'EMPLOYEE' | 'VISITOR',
  filter: EmployeeActivityFilter,
): Prisma.ParkingReservationWhereInput {
  return {
    employeeUserId,
    requesterType,
    ...(filter.status ? { reservationStatus: filter.status } : {}),
    ...(filter.dateFrom && filter.dateTo
      ? { visitStartAt: { lt: filter.dateTo }, visitEndAt: { gt: filter.dateFrom } }
      : {}),
    ...(filter.keyword
      ? {
          OR: [
            { requesterName: { contains: filter.keyword } },
            { vehicleNo: { contains: filter.keyword } },
            { visitPurpose: { contains: filter.keyword } },
          ],
        }
      : {}),
  };
}

function tripWhere(
  employeeUserId: number,
  filter: EmployeeActivityFilter,
): Prisma.CompanyVehicleTripWhereInput {
  return {
    employeeUserId,
    ...(filter.status ? { tripStatus: filter.status } : {}),
    ...(filter.dateFrom && filter.dateTo
      ? { requestStartAt: { lt: filter.dateTo }, requestEndAt: { gt: filter.dateFrom } }
      : {}),
    ...(filter.keyword
      ? {
          OR: [
            { destination: { contains: filter.keyword } },
            { reason: { contains: filter.keyword } },
            { assignedVehicle: { vehicleNo: { contains: filter.keyword } } },
          ],
        }
      : {}),
  };
}

function reservationToItem(reservation: ReservationRow): EmployeeActivityItem {
  const isProxy = reservation.requesterType === 'VISITOR';
  const kind: EmployeeActivityKind = isProxy ? 'PROXY_VISIT' : 'EMPLOYEE_VISIT';
  return {
    id: reservation.reservationId,
    kind,
    kindLabel: KIND_LABEL[kind],
    no: reservation.reservationNo,
    requesterName: reservation.requesterName,
    vehicleNo: reservation.vehicleNo,
    dateRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
    purpose: reservation.visitPurpose ?? '-',
    status: reservation.reservationStatus,
    href: `/employee/reservations/${reservation.reservationId}`,
    sortAt: reservation.createdAt,
  };
}

function tripToItem(trip: {
  tripId: number;
  employee: { name: string };
  assignedVehicle: { vehicleNo: string } | null;
  requestStartAt: Date;
  requestEndAt: Date;
  reason: string;
  tripStatus: ReservationStatus;
  createdAt: Date;
}): EmployeeActivityItem {
  return {
    id: trip.tripId,
    kind: 'COMPANY_VEHICLE',
    kindLabel: KIND_LABEL.COMPANY_VEHICLE,
    no: `법인#${trip.tripId}`,
    requesterName: trip.employee.name,
    vehicleNo: trip.assignedVehicle?.vehicleNo ?? '미배정',
    dateRangeText: formatKstRange(trip.requestStartAt, trip.requestEndAt),
    purpose: trip.reason,
    status: trip.tripStatus,
    href: `/employee/company-vehicle/trips/${trip.tripId}`,
    sortAt: trip.createdAt,
  };
}

/**
 * 직원 본인 활동(방문 예약 + 법인차량 신청) 통합 조회.
 *
 * 두 테이블을 DB 레벨에서 함께 페이지네이션할 수 없어(구조가 완전히 다르다), 조건에
 * 맞는 행을 모두 읽어 온 뒤 최신순으로 합쳐 애플리케이션에서 자른다 — 직원 한 명의
 * 활동 건수는 페이지 단위로 무리 없이 다룰 수 있는 규모라 이 방식으로 충분하다.
 */
export async function listEmployeeActivity(
  employeeUserId: number,
  filter: EmployeeActivityFilter = {},
): Promise<EmployeeActivityListResult> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const includeVisit = !filter.kind || filter.kind === 'EMPLOYEE_VISIT';
  const includeProxy = !filter.kind || filter.kind === 'PROXY_VISIT';
  const includeVehicle = !filter.kind || filter.kind === 'COMPANY_VEHICLE';

  const [visitRows, proxyRows, tripRows, visitCount, proxyCount, tripCount] = await Promise.all([
    includeVisit
      ? prisma.parkingReservation.findMany({
          where: reservationWhere(employeeUserId, 'EMPLOYEE', filter),
          select: RESERVATION_SELECT,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    includeProxy
      ? prisma.parkingReservation.findMany({
          where: reservationWhere(employeeUserId, 'VISITOR', filter),
          select: RESERVATION_SELECT,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    includeVehicle
      ? prisma.companyVehicleTrip.findMany({
          where: tripWhere(employeeUserId, filter),
          orderBy: { createdAt: 'desc' },
          include: {
            employee: { select: { name: true } },
            assignedVehicle: { select: { vehicleNo: true } },
          },
        })
      : Promise.resolve([]),
    prisma.parkingReservation.count({ where: reservationWhere(employeeUserId, 'EMPLOYEE', { ...filter, kind: undefined }) }),
    prisma.parkingReservation.count({ where: reservationWhere(employeeUserId, 'VISITOR', { ...filter, kind: undefined }) }),
    prisma.companyVehicleTrip.count({ where: tripWhere(employeeUserId, { ...filter, kind: undefined }) }),
  ]);

  const merged = [
    ...visitRows.map(reservationToItem),
    ...proxyRows.map(reservationToItem),
    ...tripRows.map(tripToItem),
  ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

  const totalCount =
    (includeVisit ? visitCount : 0) + (includeProxy ? proxyCount : 0) + (includeVehicle ? tripCount : 0);

  return {
    items: merged.slice((page - 1) * pageSize, page * pageSize),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    counts: {
      ALL: visitCount + proxyCount + tripCount,
      EMPLOYEE_VISIT: visitCount,
      PROXY_VISIT: proxyCount,
      COMPANY_VEHICLE: tripCount,
    },
  };
}

/** 직원 홈 "최근 예약 현황" 위젯 — 필터 없이 최신 N건만. */
export async function listRecentActivityForEmployee(
  employeeUserId: number,
  limit: number,
): Promise<EmployeeActivityItem[]> {
  const result = await listEmployeeActivity(employeeUserId, { page: 1, pageSize: limit });
  return result.items;
}
