import { ChangedByType, Prisma, ReservationStatus } from '@prisma/client';

import { assertCompanyVehicleTripTiming } from '@/domain/company-vehicle-rules';
import { assertTransition } from '@/domain/reservation-status';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import { getSystemSettings } from '@/services/settings-service';

/**
 * 법인 공용 차량 운행 신청 처리.
 *
 * 방문 예약(reservation-service.ts)과 흐름은 같지만(신청→승인→입출차→이력) 배정 대상이
 * "주차 공간"이 아니라 "차량 자산"이라 별도 서비스로 둔다. 상태 전이 검증(assertTransition)과
 * 상태 로그·감사 로그 패턴은 방문 예약과 동일하게 재사용한다.
 */

const TRIP_DETAIL_INCLUDE = {
  employee: { select: { employeeUserId: true, name: true, email: true, departmentName: true } },
  assignedVehicle: { select: { vehicleId: true, vehicleNo: true } },
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

export type CompanyVehicleTripListFilter = {
  vehicleId?: number;
  status?: ReservationStatus;
  /** 신청 직원 성명(부분 일치) */
  employeeName?: string;
  /** 운행 요청 시간이 이 구간과 겹치는 신청만 (당일 KST 00:00~24:00 등) */
  dateFrom?: Date;
  dateTo?: Date;
};

export async function listCompanyVehicleTrips(filter: CompanyVehicleTripListFilter = {}) {
  return prisma.companyVehicleTrip.findMany({
    where: {
      ...(filter.vehicleId ? { assignedVehicleId: filter.vehicleId } : {}),
      ...(filter.status ? { tripStatus: filter.status } : {}),
      ...(filter.employeeName ? { employee: { name: { contains: filter.employeeName } } } : {}),
      ...(filter.dateFrom && filter.dateTo
        ? { requestStartAt: { lt: filter.dateTo }, requestEndAt: { gt: filter.dateFrom } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      employee: { select: { name: true, departmentName: true } },
      assignedVehicle: { select: { vehicleId: true, vehicleNo: true } },
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
};

/** 직원 신청 진입점. 신청자(employeeUserId)는 항상 세션 값을 호출부가 고정해서 넘긴다. */
export async function createCompanyVehicleTrip(
  input: CreateCompanyVehicleTripInput,
  employeeUserId: number,
) {
  const settings = await getSystemSettings();
  assertCompanyVehicleTripTiming({
    requestStartAt: input.requestStartAt,
    requestEndAt: input.requestEndAt,
    settings,
  });

  return prisma.companyVehicleTrip.create({
    data: {
      employeeUserId,
      destination: input.destination.trim(),
      reason: input.reason.trim(),
      requestStartAt: input.requestStartAt,
      requestEndAt: input.requestEndAt,
      tripStatus: ReservationStatus.REQUESTED,
    },
  });
}

/** 해당 차량이 그 시간대에 이미 다른 트립(APPROVED/PARKING)에 배정되어 있는지 확인 */
async function findConflictingTrip(
  params: { vehicleId: number; requestStartAt: Date; requestEndAt: Date; excludeTripId?: number },
  tx: Prisma.TransactionClient,
): Promise<{ tripId: number } | null> {
  return tx.companyVehicleTrip.findFirst({
    where: {
      assignedVehicleId: params.vehicleId,
      tripStatus: { in: [ReservationStatus.APPROVED, ReservationStatus.PARKING] },
      requestStartAt: { lt: params.requestEndAt },
      requestEndAt: { gt: params.requestStartAt },
      ...(params.excludeTripId ? { tripId: { not: params.excludeTripId } } : {}),
    },
    select: { tripId: true },
  });
}

/** 승인 + 차량 배정. 겹치는 시간대에 이미 배정된 차량이면 거부한다. */
export async function approveCompanyVehicleTrip(
  params: { tripId: number; vehicleId: number } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  const approved = await prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, ReservationStatus.APPROVED);

    await tx.$queryRaw`SELECT vehicle_id FROM company_vehicles WHERE vehicle_id = ${params.vehicleId} FOR UPDATE`;

    const vehicle = await tx.companyVehicle.findUnique({ where: { vehicleId: params.vehicleId } });
    if (!vehicle || !vehicle.isActive) {
      throw new NotFoundError('배정할 수 있는 법인차량을 찾을 수 없습니다.');
    }

    const conflict = await findConflictingTrip(
      {
        vehicleId: params.vehicleId,
        requestStartAt: current.requestStartAt,
        requestEndAt: current.requestEndAt,
        excludeTripId: current.tripId,
      },
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        '선택하신 차량은 해당 시간대에 이미 다른 운행에 배정되어 있습니다.',
        'VEHICLE_TIME_CONFLICT',
      );
    }

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: {
        tripStatus: ReservationStatus.APPROVED,
        assignedVehicleId: params.vehicleId,
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
        changeReason: `차량 ${result.assignedVehicle?.vehicleNo ?? '-'} 배정 후 승인`,
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
        assignedVehicleId: null,
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
        assignedVehicleId: null,
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

  return cancelled;
}

/** 입·출차 관리 기능이 꺼져 있으면 호출 자체를 막는다. (방문 예약과 동일한 시스템 설정 공유) */
async function assertEntryExitEnabled(): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.entryExitManagementEnabled) {
    throw new ConflictError(
      '입·출차 처리는 현재 사용하지 않는 기능입니다.',
      'ENTRY_EXIT_DISABLED',
    );
  }
}

async function changeTripStatusByAdmin(params: {
  tripId: number;
  nextStatus: ReservationStatus;
  adminUserId: number;
  reason: string;
  extraData?: Prisma.CompanyVehicleTripUncheckedUpdateInput;
  validate?: (current: CompanyVehicleTripDetail) => void;
}): Promise<CompanyVehicleTripDetail> {
  return prisma.$transaction(async (tx) => {
    const current = await loadTripOrThrow(params.tripId, tx);
    assertTransition(current.tripStatus, params.nextStatus);
    params.validate?.(current);

    const result = await tx.companyVehicleTrip.update({
      where: { tripId: params.tripId },
      data: { tripStatus: params.nextStatus, ...params.extraData },
      include: TRIP_DETAIL_INCLUDE,
    });

    await tx.companyVehicleTripStatusLog.create({
      data: {
        tripId: params.tripId,
        previousStatus: current.tripStatus,
        currentStatus: params.nextStatus,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: params.reason,
      },
    });

    return result;
  });
}

export async function markCompanyVehicleEntry(
  params: { tripId: number; actualEntryAt: Date } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  await assertEntryExitEnabled();

  const updated = await changeTripStatusByAdmin({
    tripId: params.tripId,
    nextStatus: ReservationStatus.PARKING,
    adminUserId: params.adminUserId,
    reason: '실제 입차 처리',
    extraData: { actualEntryAt: params.actualEntryAt },
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_ENTRY,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: updated.tripId,
    detail: {},
    context: params.requestContext,
  });

  return updated;
}

export async function markCompanyVehicleExit(
  params: { tripId: number; actualExitAt: Date } & AdminActionContext,
): Promise<CompanyVehicleTripDetail> {
  await assertEntryExitEnabled();

  const updated = await changeTripStatusByAdmin({
    tripId: params.tripId,
    nextStatus: ReservationStatus.EXITED,
    adminUserId: params.adminUserId,
    reason: '실제 출차 처리',
    extraData: { actualExitAt: params.actualExitAt },
    validate: (current) => {
      if (current.actualEntryAt && params.actualExitAt < current.actualEntryAt) {
        throw new ValidationError('출차 시간은 입차 시간 이후여야 합니다.', {
          actualExitAt: ['출차 시간은 입차 시간 이후여야 합니다.'],
        });
      }
    },
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.COMPANY_VEHICLE_TRIP_EXIT,
    targetType: AUDIT_TARGETS.COMPANY_VEHICLE_TRIP,
    targetId: updated.tripId,
    detail: {},
    context: params.requestContext,
  });

  return updated;
}
