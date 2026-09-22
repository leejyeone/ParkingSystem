import { AccountStatus, ChangedByType, Prisma, ReservationStatus } from '@prisma/client';

import {
  assertCompanyVehicleTripCreateTiming,
  assertCompanyVehicleTripTiming,
} from '@/domain/company-vehicle-rules';
import { assertTransition } from '@/domain/reservation-status';
import { todayKstDateString } from '@/lib/datetime';
import {
  dispatchQuietly,
  sendNewVehicleTripRequestToAdminEmails,
  sendVehicleTripApprovedEmail,
  sendVehicleTripCancelledEmail,
  sendVehicleTripRejectedEmail,
  sendVehicleTripRequestReceivedEmail,
  sendVehicleTripReturnConfirmedEmail,
  sendVehicleTripReturnRequestedToAdminEmails,
  type CompanyVehicleTripForEmail,
} from '@/lib/email/email-service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { generateReservationNo } from '@/lib/tokens';
import { normalizeVehicleNo } from '@/lib/vehicle';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 법인 공용 차량 운행 신청 처리.
 *
 * 방문 예약(reservation-service.ts)과 다른 점: 배정 대상이 "주차 공간"이 아니라 "차량
 * 자산"이고, **차량은 직원이 신청 시점에 직접 고른다**(관리자는 승인/반려만 한다). 입·출차를
 * 관리자가 관리하는 개념도 없다 — 승인 후에는 직원이 알아서 사용하고, 다 쓰면 "반납 처리"를
 * 눌러 관리자에게 알리면 관리자가 차량 상태를 확인한 뒤 반납을 확정한다(PARKING="반납 대기",
 * EXITED="반납 완료"로 재해석 — 상태 전이 그래프 자체는 방문 예약과 동일하게 공유한다).
 * 상태 전이 검증(assertTransition)과 상태 로그·감사 로그 패턴도 방문 예약과 동일하게
 * 재사용한다.
 */

/**
 * 이 시간대에 이미 이 차량을 쓰기로 한(또는 쓰고 있는) 것으로 보는 상태.
 * REQUESTED도 포함해야 승인 대기 단계부터 같은 차량·시간대 중복 신청을 막을 수 있다 —
 * 차량을 관리자가 아니라 신청 시점에 직원이 직접 고르기 때문.
 */
const CONFLICTING_TRIP_STATUSES: ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
  ReservationStatus.PARKING,
];

/** 배정 차량 변경이 의미를 갖는 상태. 직원이 신청 시점부터 차량을 고르므로 REQUESTED도 포함한다. */
const VEHICLE_ASSIGNABLE_STATUSES: ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
  ReservationStatus.PARKING,
  ReservationStatus.EXITED,
];

const TRIP_DETAIL_INCLUDE = {
  employee: { select: { employeeUserId: true, name: true, email: true, departmentName: true } },
  assignedVehicle: {
    select: { vehicleId: true, vehicleNo: true, parkingSpace: { select: { spaceCode: true } } },
  },
  approvalAdmin: { select: { adminUserId: true, adminName: true } },
  statusLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: { changedByAdmin: { select: { adminName: true } } },
  },
} satisfies Prisma.CompanyVehicleTripInclude;

export type CompanyVehicleTripDetail = Prisma.CompanyVehicleTripGetPayload<{
  include: typeof TRIP_DETAIL_INCLUDE;
}>;

type AdminActionContext = { adminUserId: number; requestContext?: RequestContext };

/** 상태 변경 메일 발송용 필드 매핑 (`toReservationForEmail`과 같은 역할). */
function toVehicleTripForEmail(trip: CompanyVehicleTripDetail): CompanyVehicleTripForEmail {
  return {
    tripId: trip.tripId,
    tripNo: trip.tripNo ?? `#${trip.tripId}`,
    employeeName: trip.employee.name,
    employeeEmail: trip.employee.email,
    departmentName: trip.employee.departmentName,
    destination: trip.destination,
    reason: trip.reason,
    requestStartAt: trip.requestStartAt,
    requestEndAt: trip.requestEndAt,
    rejectionReason: trip.rejectionReason,
    cancelReason: trip.cancelReason,
    vehicleNo: trip.assignedVehicle?.vehicleNo ?? null,
    parkingSpaceCode: trip.assignedVehicle?.parkingSpace?.spaceCode ?? null,
  };
}

export type CompanyVehicleTripListFilter = {
  vehicleId?: number;
  status?: ReservationStatus;
  /** 신청 직원 성명(부분 일치) */
  employeeName?: string;
  /** 운행 요청 시간이 이 구간과 겹치는 신청만 (당일 KST 00:00~24:00 등) */
  dateFrom?: Date;
  dateTo?: Date;
  /**
   * true 면 실제 출차 처리된(actualEntryAt 있음) 신청만 남긴다 — 운행 대장처럼 "실제로
   * 있었던 일"만 기록해야 하는 화면에서 쓴다. 이 필터를 켜면 아래 actualEntryAt_* 정렬에서
   * NULL 정렬 순서를 신경 쓸 필요가 없어진다(결과에 NULL 이 없으므로).
   */
  actualEntryOnly?: boolean;
  /**
   * 기본 'createdAt_desc'(신청내역 목록 — 최근 신청 순). 운행 대장은 종이 운행일지처럼
   * 시간순으로 누적되는 형태가 맞으므로 'requestStartAt_asc'/'requestStartAt_desc'를
   * 쓴다 — 운행 대장의 "운행 일시"는 실제 반납 처리 시각이 아니라 신청 폼에서 직원이
   * 고른 예정 시간(requestStartAt~requestEndAt) 기준이다. 'actualEntryAt_*'는 그와
   * 별개로 실제 반납 처리 시각 기준 정렬이 필요할 때 쓴다.
   */
  order?:
    | 'createdAt_desc'
    | 'requestStartAt_asc'
    | 'requestStartAt_desc'
    | 'actualEntryAt_asc'
    | 'actualEntryAt_desc';
};

export async function listCompanyVehicleTrips(filter: CompanyVehicleTripListFilter = {}) {
  const orderBy: Prisma.CompanyVehicleTripOrderByWithRelationInput =
    filter.order === 'requestStartAt_asc'
      ? { requestStartAt: 'asc' }
      : filter.order === 'requestStartAt_desc'
        ? { requestStartAt: 'desc' }
        : filter.order === 'actualEntryAt_asc'
          ? { actualEntryAt: 'asc' }
          : filter.order === 'actualEntryAt_desc'
            ? { actualEntryAt: 'desc' }
            : { createdAt: 'desc' };

  return prisma.companyVehicleTrip.findMany({
    where: {
      ...(filter.vehicleId ? { assignedVehicleId: filter.vehicleId } : {}),
      ...(filter.status ? { tripStatus: filter.status } : {}),
      ...(filter.employeeName ? { employee: { name: { contains: filter.employeeName } } } : {}),
      ...(filter.dateFrom && filter.dateTo
        ? { requestStartAt: { lt: filter.dateTo }, requestEndAt: { gt: filter.dateFrom } }
        : {}),
      ...(filter.actualEntryOnly ? { actualEntryAt: { not: null } } : {}),
    },
    orderBy,
    include: {
      employee: { select: { name: true, departmentName: true } },
      assignedVehicle: { select: { vehicleId: true, vehicleNo: true, vehicleModel: true } },
    },
  });
}

export async function getCompanyVehicleTripDetail(
  tripId: number,
): Promise<CompanyVehicleTripDetail> {
  const trip = await prisma.companyVehicleTrip.findUnique({
    where: { tripId },
    include: TRIP_DETAIL_INCLUDE,
  });
  if (!trip) throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
  return trip;
}

async function loadTripOrThrow(
  tripId: number,
  tx: Prisma.TransactionClient,
): Promise<CompanyVehicleTripDetail> {
  const trip = await tx.companyVehicleTrip.findUnique({
    where: { tripId },
    include: TRIP_DETAIL_INCLUDE,
  });
  if (!trip) throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
  return trip;
}

export type CreateCompanyVehicleTripInput = {
  destination: string;
  reason: string;
  requestStartAt: Date;
  requestEndAt: Date;
  vehicleId: number;
};

/**
 * tripNo 생성 후 충돌(P2002)이면 재시도한다 — 방문 예약의 createWithUniqueReservationNo
 * 와 같은 패턴. 'CV-' 접두사만 다르다.
 */
async function createWithUniqueTripNo<T extends { tripId: number }>(
  handler: (tripNo: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const tripNo = generateReservationNo(todayKstDateString(), 'CV');
      return await handler(tripNo);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('trip_no')
      ) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('운행 신청번호 생성에 실패했습니다.');
}

/** 직원 신청 진입점. 신청자(employeeUserId)는 항상 세션 값을 호출부가 고정해서 넘긴다. */
export async function createCompanyVehicleTrip(
  input: CreateCompanyVehicleTripInput,
  employeeUserId: number,
) {
  const settings = await getSystemSettings();
  const now = new Date();
  assertCompanyVehicleTripCreateTiming({
    requestStartAt: input.requestStartAt,
    requestEndAt: input.requestEndAt,
    now,
    settings,
  });

  const created = await createWithUniqueTripNo((tripNo) =>
    prisma.$transaction(async (tx) => {
      // 두 직원이 거의 동시에 같은 차량·시간대를 신청해도 한쪽만 통과하도록 차량 행을
      // 먼저 잠근다(approveCompanyVehicleTrip과 같은 이유).
      await tx.$queryRaw`SELECT vehicle_id FROM company_vehicles WHERE vehicle_id = ${input.vehicleId} FOR UPDATE`;

      const vehicle = await tx.companyVehicle.findUnique({ where: { vehicleId: input.vehicleId } });
      if (!vehicle || !vehicle.isActive) {
        throw new NotFoundError('선택하신 법인차량을 찾을 수 없습니다.');
      }

      const conflict = await findConflictingTrip(
        { vehicleId: input.vehicleId, requestStartAt: input.requestStartAt, requestEndAt: input.requestEndAt },
        tx,
      );
      if (conflict) {
        throw new ConflictError(
          '선택하신 차량은 해당 시간대에 이미 다른 신청(승인 대기 포함)이 있습니다. 다른 차량이나 시간을 선택해 주세요.',
          'VEHICLE_TIME_CONFLICT',
        );
      }

      return tx.companyVehicleTrip.create({
        data: {
          tripNo,
          employeeUserId,
          destination: input.destination.trim(),
          reason: input.reason.trim(),
          requestStartAt: input.requestStartAt,
          requestEndAt: input.requestEndAt,
          assignedVehicleId: input.vehicleId,
          tripStatus: ReservationStatus.REQUESTED,
        },
        include: { employee: { select: { name: true, email: true, departmentName: true } } },
      });
    }),
  );

  dispatchQuietly(() =>
    sendNewVehicleTripRequestToAdminEmails({
      tripId: created.tripId,
      tripNo: created.tripNo ?? `#${created.tripId}`,
      employeeName: created.employee.name,
      employeeEmail: created.employee.email,
      departmentName: created.employee.departmentName,
      destination: created.destination,
      reason: created.reason,
      requestStartAt: created.requestStartAt,
      requestEndAt: created.requestEndAt,
    }),
  );

  dispatchQuietly(() =>
    sendVehicleTripRequestReceivedEmail({
      tripId: created.tripId,
      tripNo: created.tripNo ?? `#${created.tripId}`,
      employeeName: created.employee.name,
      employeeEmail: created.employee.email,
      departmentName: created.employee.departmentName,
      destination: created.destination,
      reason: created.reason,
      requestStartAt: created.requestStartAt,
      requestEndAt: created.requestEndAt,
    }),
  );

  return created;
}

/** 해당 차량이 그 시간대에 이미 다른 트립(승인 대기 포함)에 배정되어 있는지 확인 */
async function findConflictingTrip(
  params: { vehicleId: number; requestStartAt: Date; requestEndAt: Date; excludeTripId?: number },
  tx: Prisma.TransactionClient,
): Promise<{ tripId: number } | null> {
  return tx.companyVehicleTrip.findFirst({
    where: {
      assignedVehicleId: params.vehicleId,
      tripStatus: { in: CONFLICTING_TRIP_STATUSES },
      requestStartAt: { lt: params.requestEndAt },
      requestEndAt: { gt: params.requestStartAt },
      ...(params.excludeTripId ? { tripId: { not: params.excludeTripId } } : {}),
    },
    select: { tripId: true },
  });
}

/**
 * 주어진 시간대와 겹치는(승인 대기 포함) 트립에 배정된 차량 ID 전체.
 * 관리자 상세 화면에서 "이 시간대엔 이미 다른 신청이 있음"을 표시하는 데 쓴다.
 * 단일 차량만 보는 `findConflictingTrip`(생성/승인/수정 트랜잭션의 최종 확인용)과 달리
 * 배치 조회용이며, 잠금(FOR UPDATE) 없이 읽기 전용으로만 쓴다.
 */
export async function findConflictingVehicleIds(params: {
  requestStartAt: Date;
  requestEndAt: Date;
  excludeTripId?: number;
}): Promise<Set<number>> {
  const rows = await prisma.companyVehicleTrip.findMany({
    where: {
      assignedVehicleId: { not: null },
      tripStatus: { in: CONFLICTING_TRIP_STATUSES },
      requestStartAt: { lt: params.requestEndAt },
      requestEndAt: { gt: params.requestStartAt },
      ...(params.excludeTripId ? { tripId: { not: params.excludeTripId } } : {}),
    },
    select: { assignedVehicleId: true },
  });
  return new Set(rows.map((row) => row.assignedVehicleId).filter((id): id is number => id !== null));
}

/**
 * 직원 신청 화면의 차량 선택 그리드용 — 그 날짜(KST)에 걸치는 활성 차량별 기존 예약
 * (승인 대기 포함) 구간을 전부 돌려준다. `findConflictingVehicleIds`는 "겹치는지 여부"만
 * 알려주는 배치 조회고, 이건 실제 구간 목록까지 필요한 그리드 렌더링용이라 별도로 둔다.
 */
export type VehicleAvailability = {
  vehicleId: number;
  vehicleNo: string;
  vehicleModel: string | null;
  /** 이 차량이 고정 주차된 위치(주차면 코드). 고정 배정이 없으면 null. */
  parkingSpaceCode: string | null;
  busyRanges: { start: Date; end: Date }[];
};

export async function getVehicleAvailabilityForDate(
  dateRange: { start: Date; end: Date },
  excludeTripId?: number,
): Promise<VehicleAvailability[]> {
  const [vehicles, trips] = await Promise.all([
    prisma.companyVehicle.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { vehicleId: 'asc' },
      select: {
        vehicleId: true,
        vehicleNo: true,
        vehicleModel: true,
        parkingSpace: { select: { spaceCode: true } },
      },
    }),
    prisma.companyVehicleTrip.findMany({
      where: {
        assignedVehicleId: { not: null },
        tripStatus: { in: CONFLICTING_TRIP_STATUSES },
        requestStartAt: { lt: dateRange.end },
        requestEndAt: { gt: dateRange.start },
        ...(excludeTripId ? { tripId: { not: excludeTripId } } : {}),
      },
      select: { assignedVehicleId: true, requestStartAt: true, requestEndAt: true },
    }),
  ]);

  const byVehicle = new Map<number, { start: Date; end: Date }[]>();
  for (const trip of trips) {
    if (trip.assignedVehicleId === null) continue;
    const list = byVehicle.get(trip.assignedVehicleId) ?? [];
    list.push({ start: trip.requestStartAt, end: trip.requestEndAt });
    byVehicle.set(trip.assignedVehicleId, list);
  }

  return vehicles.map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    vehicleNo: vehicle.vehicleNo,
    vehicleModel: vehicle.vehicleModel,
    parkingSpaceCode: vehicle.parkingSpace?.spaceCode ?? null,
    busyRanges: byVehicle.get(vehicle.vehicleId) ?? [],
  }));
}

/**
 * 승인. 차량은 신청 시점에 이미 직원이 골랐으므로 여기서는 그 사이 다른 신청이 먼저
 * 승인돼 겹침이 생기지 않았는지 방어적으로 재확인만 한다.
 */
export async function approveCompanyVehicleTrip(
  params: { tripId: number } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const approved = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.APPROVED);

    if (current.assignedVehicleId === null) {
      throw new ConflictError(
        '신청에 배정된 차량 정보가 없습니다. 신청 내용을 다시 확인해 주세요.',
        'VEHICLE_NOT_ASSIGNED',
      );
    }

    await tx.$queryRaw`SELECT vehicle_id FROM company_vehicles WHERE vehicle_id = ${current.assignedVehicleId} FOR UPDATE`;

    const vehicle = await tx.companyVehicle.findUnique({ where: { vehicleId: current.assignedVehicleId } });
    if (!vehicle || !vehicle.isActive) {
      throw new NotFoundError('신청 시점에 선택된 법인차량을 찾을 수 없습니다.');
    }

    const conflict = await findConflictingTrip(
      {
        vehicleId: current.assignedVehicleId,
        requestStartAt: current.requestStartAt,
        requestEndAt: current.requestEndAt,
        excludeTripId: current.tripId,
      },
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        '선택된 차량이 그 사이 해당 시간대에 다른 신청과 겹치게 되었습니다. 신청자에게 재조정을 요청하거나 반려해 주세요.',
        'VEHICLE_TIME_CONFLICT',
      );
    }

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.APPROVED,
        approvalAdminId: params.adminUserId,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.APPROVED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: `차량 ${result.assignedVehicle?.vehicleNo ?? '-'} 신청으로 승인`,
      },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_APPROVE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: approved.tripId,
    detail: { assignedVehicleNo: approved.assignedVehicle?.vehicleNo ?? null },
    context: params.requestContext,
  });

  dispatchQuietly(() => sendVehicleTripApprovedEmail(toVehicleTripForEmail(approved)));

  return approved;
}

export async function rejectCompanyVehicleTrip(
  params: { tripId: number; rejectionReason: string } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const rejected = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.REJECTED);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: params.rejectionReason,
        approvalAdminId: params.adminUserId,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.REJECTED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: params.rejectionReason,
      },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_REJECT,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: rejected.tripId,
    detail: { rejectionReason: rejected.rejectionReason },
    context: params.requestContext,
  });

  dispatchQuietly(() => sendVehicleTripRejectedEmail(toVehicleTripForEmail(rejected)));

  return rejected;
}

export async function cancelCompanyVehicleTripByAdmin(
  params: { tripId: number; cancelReason: string } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.CANCELLED);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: params.cancelReason,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.CANCELLED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: params.cancelReason,
      },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_CANCEL,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: cancelled.tripId,
    detail: { cancelReason: cancelled.cancelReason },
    context: params.requestContext,
  });

  dispatchQuietly(() => sendVehicleTripCancelledEmail(toVehicleTripForEmail(cancelled)));

  return cancelled;
}

/**
 * 관리자의 "미사용" 처리 — 방문 예약의 `markNoShow`(reservation-service.ts)와 같은 개념.
 * 승인은 났지만 직원이 나타나지 않은(차를 가져가지 않은) 신청을 종료 상태로 정리한다.
 * 공유 전이표(`ALLOWED_TRANSITIONS`)에 이미 APPROVED→NO_SHOW가 있어 그대로 재사용한다
 * (승인 대기 상태는 반려로 처리하면 되므로 대상에서 뺀다).
 */
export async function markCompanyVehicleTripNoShow(
  params: { tripId: number; reason?: string } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const reason = params.reason?.trim() || '운행 시간 종료 후 미사용';

  const result = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.NO_SHOW);

    const updated = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: { tripStatus: ReservationStatus.NO_SHOW },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.NO_SHOW,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: reason,
      },
    });

    return updated;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_NO_SHOW,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: result.tripId,
    detail: { reason },
    context: params.requestContext,
  });

  return result;
}

/**
 * 신청자(운행 예정자) 본인 취소. 방문 예약의 `cancelReservationByRequester`와 같은 원칙 —
 * 승인 대기(REQUESTED) 상태에서만 허용한다. 승인 이후에는 차량이 이미 배정된 상태라
 * 관리자에게 문의해 처리하도록 안내한다(`cancelCompanyVehicleTripByAdmin` 참고).
 */
export async function cancelCompanyVehicleTripByRequester(params: {
  tripId: number;
  employeeUserId: number;
  cancelReason: string;
}): Promise<CompanyVehicleTripDetail> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    if (current.employeeUserId !== params.employeeUserId) {
      // 남의 신청 ID 를 넣은 경우도 "없음"으로 동일하게 처리한다.
      throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
    }
    if (current.tripStatus !== ReservationStatus.REQUESTED) {
      throw new ConflictError(
        '승인 대기 상태에서만 취소할 수 있습니다. 승인 이후 취소가 필요하면 관리자에게 문의해 주세요.',
        'CHANGE_NOT_ALLOWED',
      );
    }
    assertTransition(current.tripStatus, ReservationStatus.CANCELLED);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: params.cancelReason,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.CANCELLED,
        changedByType: ChangedByType.REQUESTER,
        changeReason: params.cancelReason,
      },
    });

    return result;
  });

  dispatchQuietly(() => sendVehicleTripCancelledEmail(toVehicleTripForEmail(cancelled)));

  return cancelled;
}

/**
 * 신청자(운행 예정자) 본인 수정. 방문 예약의 `updateReservationByRequester`와 같은 원칙 —
 * 관리자 승인 전(REQUESTED)에만 허용한다. 이미 차량이 배정·승인된 뒤에는 관리자만 고칠 수
 * 있다(`updateCompanyVehicleTripDetails` 참고). 새 신청(`createCompanyVehicleTrip`)과
 * 같은 시간 규칙·차량 중복 검증을 그대로 재사용한다 — 수정도 결국 "그 시간에 그 차를 다시
 * 신청하는 것"과 같기 때문이다. REQUESTED에서 REQUESTED로 상태 자체는 바뀌지 않으므로
 * 상태 로그는 남기지 않는다.
 */
export async function updateCompanyVehicleTripByRequester(params: {
  tripId: number;
  employeeUserId: number;
  destination: string;
  reason: string;
  requestStartAt: Date;
  requestEndAt: Date;
  vehicleId: number;
}): Promise<CompanyVehicleTripDetail> {
  const settings = await getSystemSettings();
  const now = new Date();
  assertCompanyVehicleTripCreateTiming({
    requestStartAt: params.requestStartAt,
    requestEndAt: params.requestEndAt,
    now,
    settings,
  });

  return prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    if (current.employeeUserId !== params.employeeUserId) {
      // 남의 신청 ID 를 넣은 경우도 "없음"으로 동일하게 처리한다.
      throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
    }
    if (current.tripStatus !== ReservationStatus.REQUESTED) {
      throw new ConflictError(
        '승인 대기 상태에서만 수정할 수 있습니다. 승인 이후 변경이 필요하면 관리자에게 문의해 주세요.',
        'CHANGE_NOT_ALLOWED',
      );
    }

    // createCompanyVehicleTrip과 동일하게 차량 행을 먼저 잠근다 — 잠그지 않으면 두 신청이
    // 거의 동시에 같은 차량·시간대로 수정될 때 서로의 커밋 전 상태를 못 보고 둘 다
    // findConflictingTrip을 통과할 수 있다.
    await tx.$queryRaw`SELECT vehicle_id FROM company_vehicles WHERE vehicle_id = ${params.vehicleId} FOR UPDATE`;

    const vehicle = await tx.companyVehicle.findUnique({ where: { vehicleId: params.vehicleId } });
    if (!vehicle || !vehicle.isActive) {
      throw new NotFoundError('선택하신 법인차량을 찾을 수 없습니다.');
    }

    const conflict = await findConflictingTrip(
      {
        vehicleId: params.vehicleId,
        requestStartAt: params.requestStartAt,
        requestEndAt: params.requestEndAt,
        excludeTripId: params.tripId,
      },
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        '선택하신 차량은 해당 시간대에 이미 다른 신청(승인 대기 포함)이 있습니다. 다른 차량이나 시간을 선택해 주세요.',
        'VEHICLE_TIME_CONFLICT',
      );
    }

    return tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        destination: params.destination.trim(),
        reason: params.reason.trim(),
        requestStartAt: params.requestStartAt,
        requestEndAt: params.requestEndAt,
        assignedVehicleId: params.vehicleId,
      },
      include: TRIP_DETAIL_INCLUDE,
    });
  });
}

/**
 * 신청 상세(관리자 화면 카드별 [수정하기])에서 신청 내용(신청 직원·행선지·사유·
 * 운행시간)과 사후 정정이 필요한 운행 기록(배정 차량·반납 처리/확정 시각)을
 * 관리자가 직접 고친다. 신청 단계의 운영시간/최대 사용시간 규칙
 * (`assertCompanyVehicleTripTiming`)은 관리자가 고친 시간에도 동일하게 적용한다 —
 * 그래야 관리자 수정을 거쳐 운영시간 밖이나 최대 사용시간을 넘는 신청이 남는 걸 막을
 * 수 있다(방문 예약 관리자 수정의 `checkVisitRange`/`checkOperatingHours` 재검증과
 * 같은 원칙). 반납 처리/확정(정방향 상태 전이) 자체는 requestCompanyVehicleReturn(직원)/
 * confirmCompanyVehicleReturn(관리자)이 맡고, 여기서는 신청 내용과 이미 기록된 실제
 * 시각을 바로잡는다 — 다만 실제 시각을 지워서(null) 그 처리 자체를 취소하는 경우에는,
 * `reservation-service.ts`의 `updateEntryExitRecords`와 같은 이유로 `tripStatus`도 처리
 * 이전 상태로 함께 되돌리고 상태 로그를 남긴다(정방향 전이가 아니라 사후 취소라
 * `assertTransition`은 쓰지 않는다 — `ALLOWED_TRANSITIONS`에는 역방향 전이가 정의돼
 * 있지 않기 때문).
 */
export async function updateCompanyVehicleTripDetails(
  params: {
    tripId: number;
    employeeUserId: number;
    destination: string;
    reason: string;
    requestStartAt: Date;
    requestEndAt: Date;
    assignedVehicleId: number | null;
    actualEntryAt: Date | null;
    actualExitAt: Date | null;
  } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const settings = await getSystemSettings();
  assertCompanyVehicleTripTiming({
    requestStartAt: params.requestStartAt,
    requestEndAt: params.requestEndAt,
    settings,
  });

  // actualEntryAt은 "반납 처리 시각", actualExitAt은 "반납 확정 시각"이다 — 확정이
  // 처리보다 먼저일 수 없다.
  if (
    params.actualEntryAt &&
    params.actualExitAt &&
    params.actualExitAt < params.actualEntryAt
  ) {
    throw new ValidationError('반납 확정 시간은 반납 처리 시간 이후여야 합니다.', {
      actualExitAt: ['반납 확정 시간은 반납 처리 시간 이후여야 합니다.'],
    });
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);

    if (params.employeeUserId !== current.employeeUserId) {
      const employee = await tx.employeeUser.findFirst({
        where: {
          employeeUserId: params.employeeUserId,
          deletedAt: null,
          accountStatus: AccountStatus.ACTIVE,
        },
        select: { employeeUserId: true },
      });
      if (!employee) {
        throw new ValidationError('신청 직원을 찾을 수 없습니다. 다시 선택해 주세요.', {
          employeeUserId: ['신청 직원을 찾을 수 없습니다. 다시 선택해 주세요.'],
        });
      }
    }

    const vehicleChanged = params.assignedVehicleId !== current.assignedVehicleId;
    const timeChanged =
      params.requestStartAt.getTime() !== current.requestStartAt.getTime() ||
      params.requestEndAt.getTime() !== current.requestEndAt.getTime();

    if (params.assignedVehicleId !== null && (vehicleChanged || timeChanged)) {
      // REJECTED/CANCELLED(종료된 신청)에는 이 경로로 차량을 넣어도 의미가 없다 —
      // changeAssignedSpace(방문 예약의 주차면 재배정)가 상태를 제한하는 것과 같은 이유.
      if (!VEHICLE_ASSIGNABLE_STATUSES.includes(current.tripStatus)) {
        throw new ConflictError(
          '종료(반려/취소)된 신청은 배정 차량을 변경할 수 없습니다.',
          'VEHICLE_CHANGE_NOT_ALLOWED',
        );
      }

      // approveCompanyVehicleTrip과 동일하게 차량 행을 먼저 잠근다 — 잠그지 않으면 두
      // 관리자가 거의 동시에 같은 차량을 서로 다른(겹치는) 시간대로 재배정할 때 서로의
      // 커밋 전 상태를 못 보고 둘 다 findConflictingTrip을 통과해, 한 차량이 겹치는
      // 시간대에 이중 배정될 수 있다. 차량은 그대로 두고 시간만 바꾼 경우도 같은 문제가
      // 생길 수 있어(다른 트립이 새 시간대를 먼저 차지했을 수 있음) 차량 변경 여부와
      // 무관하게 시간이 바뀌면 항상 다시 검증한다.
      await tx.$queryRaw`SELECT vehicle_id FROM company_vehicles WHERE vehicle_id = ${params.assignedVehicleId} FOR UPDATE`;

      const vehicle = await tx.companyVehicle.findFirst({
        where: { vehicleId: params.assignedVehicleId, isActive: true },
        select: { vehicleId: true },
      });
      if (!vehicle) {
        throw new ValidationError('배정할 차량을 찾을 수 없습니다. 다시 선택해 주세요.', {
          assignedVehicleId: ['배정할 차량을 찾을 수 없습니다. 다시 선택해 주세요.'],
        });
      }

      const conflict = await findConflictingTrip(
        {
          vehicleId: params.assignedVehicleId,
          requestStartAt: params.requestStartAt,
          requestEndAt: params.requestEndAt,
          excludeTripId: params.tripId,
        },
        tx,
      );
      if (conflict) {
        throw new ConflictError(
          '선택하신 차량은 해당 시간대에 이미 다른 운행에 배정되어 있습니다.',
          'VEHICLE_TIME_CONFLICT',
        );
      }
    }

    /*
     * 반납 처리/확정 기록을 지우면(값 -> null) 그 처리 이전 상태로 되돌린다 —
     * requestCompanyVehicleReturn/confirmCompanyVehicleReturn이 기록을 "남길" 때
     * tripStatus를 함께 전이시키는 것과 대칭이다. 나중 사건인 반납 확정(actualExitAt)
     * 기록부터 지워야 EXITED->PARKING, 그다음 반납 처리(actualEntryAt) 기록을 지워야
     * PARKING->APPROVED — 한 번에 두 값을 함께 null로 보내도 이 순서대로 처리하므로
     * 문제없다.
     */
    let nextTripStatus = current.tripStatus;
    const statusLogsToWrite: {
      previousStatus: ReservationStatus;
      currentStatus: ReservationStatus;
      changeReason: string;
    }[] = [];

    if (params.actualExitAt === null && current.actualExitAt !== null) {
      if (nextTripStatus !== ReservationStatus.EXITED) {
        throw new ConflictError(
          '반납 확정된 신청만 반납 확정 기록을 지울 수 있습니다.',
          'TRIP_NOT_EXITED',
        );
      }
      statusLogsToWrite.push({
        previousStatus: nextTripStatus,
        currentStatus: ReservationStatus.PARKING,
        changeReason: '반납 확정 기록 삭제(관리자 정정) — 반납 확정 이전 상태로 되돌림',
      });
      nextTripStatus = ReservationStatus.PARKING;
    }

    if (params.actualEntryAt === null && current.actualEntryAt !== null) {
      if (nextTripStatus !== ReservationStatus.PARKING) {
        throw new ConflictError(
          '반납 처리된 신청만 반납 처리 기록을 지울 수 있습니다. (반납 확정 기록이 남아 있다면 함께 지워 주세요)',
          'TRIP_NOT_PARKING',
        );
      }
      statusLogsToWrite.push({
        previousStatus: nextTripStatus,
        currentStatus: ReservationStatus.APPROVED,
        changeReason: '반납 처리 기록 삭제(관리자 정정) — 반납 처리 이전 상태로 되돌림',
      });
      nextTripStatus = ReservationStatus.APPROVED;
    }

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        employeeUserId: params.employeeUserId,
        destination: params.destination.trim(),
        reason: params.reason.trim(),
        requestStartAt: params.requestStartAt,
        requestEndAt: params.requestEndAt,
        assignedVehicleId: params.assignedVehicleId,
        actualEntryAt: params.actualEntryAt,
        actualExitAt: params.actualExitAt,
        tripStatus: nextTripStatus,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    for (const log of statusLogsToWrite) {
      await tx.companyVehicleTripStatusLog.create({
        data: {
          tripId: params.tripId,
          previousStatus: log.previousStatus,
          currentStatus: log.currentStatus,
          changedByType: ChangedByType.ADMIN,
          changedByAdminId: params.adminUserId,
          changeReason: log.changeReason,
        },
      });
    }

    return { result, current };
  });

  const { result: updated, current } = txResult;

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_UPDATE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: updated.tripId,
    detail: {
      destination: updated.destination,
      reason: updated.reason,
      requestStartAt: updated.requestStartAt,
      requestEndAt: updated.requestEndAt,
      employeeUserId: { before: current.employeeUserId, after: updated.employeeUserId },
      assignedVehicleId: { before: current.assignedVehicleId, after: updated.assignedVehicleId },
      actualEntryAt: { before: current.actualEntryAt, after: updated.actualEntryAt },
      actualExitAt: { before: current.actualExitAt, after: updated.actualExitAt },
    },
    context: params.requestContext,
  });

  return updated;
}

/**
 * 운행일지 주행거리 기록(관리자 사후 정정용). 상태 전이가 아니라 단순 필드 갱신이라
 * 상태 로그는 남기지 않고, 다른 관리자 조작처럼 감사 로그만 남긴다. 1차 입력은 이제
 * 신청 직원 본인이 한다(`updateCompanyVehicleTripMileageByEmployee` 참고) — 이 함수는
 * 관리자가 나중에 값을 보정해야 할 때 쓴다.
 */
export async function updateCompanyVehicleTripMileage(
  params: {
    tripId: number;
    odometerStartKm: number | null;
    odometerEndKm: number | null;
    manualDistanceKm: number | null;
  } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  await loadTripOrThrow(params.tripId, prisma);

  const updated = await prisma.companyVehicleTrip.update({
    where: { tripId: params.tripId },
    data: {
      odometerStartKm: params.odometerStartKm,
      odometerEndKm: params.odometerEndKm,
      manualDistanceKm: params.manualDistanceKm,
    },
    include: TRIP_DETAIL_INCLUDE,
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_UPDATE,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: updated.tripId,
    detail: {
      odometerStartKm: updated.odometerStartKm,
      odometerEndKm: updated.odometerEndKm,
      manualDistanceKm: updated.manualDistanceKm,
    },
    context: params.requestContext,
  });

  return updated;
}

/**
 * 운행일지 주행거리 기록 — 신청 직원 본인 입력. 승인 완료 후 반납 처리(PARKING 전이)
 * 전까지 몇 번이든 저장할 수 있다. 상태 전이가 아니라 단순 필드 갱신이고, 직원 액터는
 * 감사 로그(AuditLog) 대상이 아니므로(관리자 전용 스키마) 별도 로그는 남기지 않는다.
 */
export async function updateCompanyVehicleTripMileageByEmployee(params: {
  tripId: number;
  employeeUserId: number;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  manualDistanceKm: number | null;
}): Promise<CompanyVehicleTripDetail> {
  const current = await loadTripOrThrow(params.tripId, prisma);

  if (current.employeeUserId !== params.employeeUserId) {
    throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
  }
  if (current.tripStatus !== ReservationStatus.APPROVED) {
    throw new ConflictError(
      '승인 완료 후 반납 처리 전까지만 주행거리를 입력할 수 있습니다.',
      'MILEAGE_EDIT_NOT_ALLOWED',
    );
  }

  return prisma.companyVehicleTrip.update({
    where: { tripId: params.tripId },
    data: {
      odometerStartKm: params.odometerStartKm,
      odometerEndKm: params.odometerEndKm,
      manualDistanceKm: params.manualDistanceKm,
    },
    include: TRIP_DETAIL_INCLUDE,
  });
}

/**
 * 신청 직원 본인의 "반납 처리". 승인 완료(APPROVED) 상태에서만 가능하며, 입·출차를
 * 관리자가 관리하던 예전 흐름(markCompanyVehicleEntry)을 대체한다 — 이제 그 사이 실제
 * 사용은 시스템이 추적하지 않고, 직원이 다 쓰고 나서 이 버튼을 눌러야만 실제 상태가
 * 바뀐다(APPROVED→PARKING="반납 대기"). 관리자가 확인하고 확정해야 완전히 끝난다
 * (`confirmCompanyVehicleReturn` 참고).
 */
export async function requestCompanyVehicleReturn(params: {
  tripId: number;
  employeeUserId: number;
  /** 실제 반납한 시각. 안 주면 지금 시각으로 처리한다(버튼을 누른 시각). */
  actualEntryAt?: Date;
}): Promise<CompanyVehicleTripDetail> {
  const returned = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    if (current.employeeUserId !== params.employeeUserId) {
      throw new NotFoundError('법인차량 운행 신청을 찾을 수 없습니다.');
    }
    assertTransition(current.tripStatus, ReservationStatus.PARKING);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.PARKING,
        actualEntryAt: params.actualEntryAt ?? new Date(),
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.PARKING,
        changedByType: ChangedByType.REQUESTER,
        changeReason: '반납 처리',
      },
    });

    return result;
  });

  dispatchQuietly(() =>
    sendVehicleTripReturnRequestedToAdminEmails(toVehicleTripForEmail(returned)),
  );

  return returned;
}

/**
 * 관리자의 "반납 확정". 직원의 반납 처리(PARKING) 이후 차량 상태를 확인하고 나서
 * 최종적으로 종료 처리한다(PARKING→EXITED="반납 완료") — 예전 markCompanyVehicleExit를
 * 대체한다.
 */
export async function confirmCompanyVehicleReturn(
  params: { tripId: number; confirmMemo?: string } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const confirmed = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.EXITED);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: { tripStatus: ReservationStatus.EXITED, actualExitAt: new Date() },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: ReservationStatus.EXITED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: params.confirmMemo?.trim() || '반납 확정',
      },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_RETURN_CONFIRMED,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: confirmed.tripId,
    detail: { confirmMemo: params.confirmMemo ?? null },
    context: params.requestContext,
  });

  dispatchQuietly(() => sendVehicleTripReturnConfirmedEmail(toVehicleTripForEmail(confirmed)));

  return confirmed;
}

export type CompanyVehicleTripSearchResult = {
  tripId: number;
  tripNo: string | null;
  tripStatus: ReservationStatus;
  employeeName: string;
  vehicleNo: string | null;
};

/**
 * 관리자 대시보드 상단바 통합 검색용 — 신청번호·신청 직원명·배정 차량번호 부분일치 OR 검색.
 * `listCompanyVehicleTrips`의 필터(AND 조합)와 달리 자동완성 드롭다운에 쓰는 가벼운
 * 상위 N건 검색이다.
 */
export async function searchCompanyVehicleTripsForAdmin(
  query: string,
  limit = 5,
): Promise<CompanyVehicleTripSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const trips = await prisma.companyVehicleTrip.findMany({
    where: {
      OR: [
        { tripNo: { contains: trimmed } },
        { employee: { name: { contains: trimmed } } },
        { assignedVehicle: { vehicleNo: { contains: normalizeVehicleNo(trimmed) } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      tripId: true,
      tripNo: true,
      tripStatus: true,
      employee: { select: { name: true } },
      assignedVehicle: { select: { vehicleNo: true } },
    },
  });

  return trips.map((trip) => ({
    tripId: trip.tripId,
    tripNo: trip.tripNo,
    tripStatus: trip.tripStatus,
    employeeName: trip.employee.name,
    vehicleNo: trip.assignedVehicle?.vehicleNo ?? null,
  }));
}
