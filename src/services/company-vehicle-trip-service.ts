import { AccountStatus, ChangedByType, Prisma, ReservationStatus } from '@prisma/client';

import { assertCompanyVehicleTripTiming } from '@/domain/company-vehicle-rules';
import { assertTransition } from '@/domain/reservation-status';
import { todayKstDateString } from '@/lib/datetime';
import { dispatchQuietly, sendNewVehicleTripRequestToAdminEmails } from '@/lib/email/email-service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { generateReservationNo } from '@/lib/tokens';
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
  /**
   * true 면 실제 출차 처리된(actualEntryAt 있음) 신청만 남긴다 — 운행 대장처럼 "실제로
   * 있었던 일"만 기록해야 하는 화면에서 쓴다. 이 필터를 켜면 아래 actualEntryAt_* 정렬에서
   * NULL 정렬 순서를 신경 쓸 필요가 없어진다(결과에 NULL 이 없으므로).
   */
  actualEntryOnly?: boolean;
  /**
   * 기본 'createdAt_desc'(신청내역 목록 — 최근 신청 순). 운행 대장은 종이 운행일지처럼
   * 시간순으로 누적되는 형태가 맞으므로 'requestStartAt_asc'를 쓴다. 'actualEntryAt_*'는
   * 예정 시간이 아니라 실제 출차 시각(운행 대장에서 "실제 운행 일시") 기준 정렬이다 —
   * 아직 출차 처리 전(실제 운행 일시 없음)인 행은 MySQL 기본 동작대로 오름차순에서는
   * 맨 앞, 내림차순에서는 맨 뒤에 온다.
   */
  order?:
    | 'createdAt_desc'
    | 'requestStartAt_asc'
    | 'actualEntryAt_asc'
    | 'actualEntryAt_desc';
};

export async function listCompanyVehicleTrips(filter: CompanyVehicleTripListFilter = {}) {
  const orderBy: Prisma.CompanyVehicleTripOrderByWithRelationInput =
    filter.order === 'requestStartAt_asc'
      ? { requestStartAt: 'asc' }
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
  assertCompanyVehicleTripTiming({
    requestStartAt: input.requestStartAt,
    requestEndAt: input.requestEndAt,
    settings,
  });

  const created = await createWithUniqueTripNo((tripNo) =>
    prisma.companyVehicleTrip.create({
      data: {
        tripNo,
        employeeUserId,
        destination: input.destination.trim(),
        reason: input.reason.trim(),
        requestStartAt: input.requestStartAt,
        requestEndAt: input.requestEndAt,
        tripStatus: ReservationStatus.REQUESTED,
      },
      include: { employee: { select: { name: true, departmentName: true } } },
    }),
  );

  dispatchQuietly(() =>
    sendNewVehicleTripRequestToAdminEmails({
      tripId: created.tripId,
      tripNo: created.tripNo ?? `#${created.tripId}`,
      employeeName: created.employee.name,
      departmentName: created.employee.departmentName,
      destination: created.destination,
      reason: created.reason,
      requestStartAt: created.requestStartAt,
      requestEndAt: created.requestEndAt,
    }),
  );

  return created;
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
  return prisma.$transaction(async (tx) => {
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
}

/**
 * 신청 상세(관리자 화면 카드별 [수정하기])에서 신청 내용(신청 직원·행선지·사유·
 * 운행시간)과 사후 정정이 필요한 운행 기록(배정 차량·실제 출차/입차 시각)을
 * 관리자가 직접 고친다. 신청 단계의 운영시간/최대 사용시간 규칙
 * (`assertCompanyVehicleTripTiming`)은 관리자가 고친 시간에도 동일하게 적용한다 —
 * 그래야 관리자 수정을 거쳐 운영시간 밖이나 최대 사용시간을 넘는 신청이 남는 걸 막을
 * 수 있다(방문 예약 관리자 수정의 `checkVisitRange`/`checkOperatingHours` 재검증과
 * 같은 원칙). 실제 출·입차 "처리"(정방향 상태 전이) 자체는 markCompanyVehicleEntry/Exit
 * 가 맡고, 여기서는 신청 내용과 이미 기록된 실제 시각을 바로잡는다 — 다만 실제 시각을
 * 지워서(null) 그 처리 자체를 취소하는 경우에는, `reservation-service.ts`의
 * `updateEntryExitRecords`와 같은 이유로 `tripStatus`도 처리 이전 상태로 함께 되돌리고
 * 상태 로그를 남긴다(정방향 전이가 아니라 사후 취소라 `assertTransition`은 쓰지 않는다 —
 * `ALLOWED_TRANSITIONS`에는 역방향 전이가 정의돼 있지 않기 때문).
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

  // 법인차량은 방문 예약과 입출차 방향이 반대라, actualEntryAt이 "실제 출차",
  // actualExitAt이 "실제 입차"다 — 그래도 시간 순서상 출차가 입차보다 먼저여야 한다.
  if (
    params.actualEntryAt &&
    params.actualExitAt &&
    params.actualExitAt < params.actualEntryAt
  ) {
    throw new ValidationError('입차 시간은 출차 시간 이후여야 합니다.', {
      actualExitAt: ['입차 시간은 출차 시간 이후여야 합니다.'],
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

    if (
      params.assignedVehicleId !== null &&
      params.assignedVehicleId !== current.assignedVehicleId
    ) {
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
     * 실제 출·입차 기록을 지우면(값 -> null) 그 처리 이전 상태로 되돌린다 —
     * markCompanyVehicleEntry/Exit 가 기록을 "남길" 때 tripStatus 를 함께 전이시키는
     * 것과 대칭이다. 법인차량은 필드 의미가 반대라(actualEntryAt=출차, actualExitAt=
     * 입차) 되돌리는 순서도 반대다: 나중 사건인 입차(actualExitAt) 기록부터 지워야
     * EXITED->PARKING, 그다음 출차(actualEntryAt) 기록을 지워야 PARKING->APPROVED —
     * 한 번에 두 값을 함께 null 로 보내도 이 순서대로 처리하므로 문제없다.
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
          '입차 처리된 신청만 입차 기록을 지울 수 있습니다.',
          'TRIP_NOT_EXITED',
        );
      }
      statusLogsToWrite.push({
        previousStatus: nextTripStatus,
        currentStatus: ReservationStatus.PARKING,
        changeReason: '입차 기록 삭제(관리자 정정) — 입차 처리 이전 상태로 되돌림',
      });
      nextTripStatus = ReservationStatus.PARKING;
    }

    if (params.actualEntryAt === null && current.actualEntryAt !== null) {
      if (nextTripStatus !== ReservationStatus.PARKING) {
        throw new ConflictError(
          '출차 처리된 신청만 출차 기록을 지울 수 있습니다. (입차 기록이 남아 있다면 함께 지워 주세요)',
          'TRIP_NOT_PARKING',
        );
      }
      statusLogsToWrite.push({
        previousStatus: nextTripStatus,
        currentStatus: ReservationStatus.APPROVED,
        changeReason: '출차 기록 삭제(관리자 정정) — 출차 처리 이전 상태로 되돌림',
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
 * 운행일지 주행거리 기록. 상태 전이가 아니라 단순 필드 갱신이라 상태 로그는 남기지
 * 않고, 다른 관리자 조작처럼 감사 로그만 남긴다. 입·출차 관리 기능 on/off 와 무관하게
 * 항상 사용할 수 있다(실제로는 입출차 관리를 꺼 둔 곳도 계기판 숫자는 따로 기록한다).
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
    // 법인차량은 승인 후 차가 먼저 나가는(출차) 흐름이라, 이 첫 처리(APPROVED→PARKING)가
    // 실제로는 "출차 처리"다 — 방문 예약과 방향이 반대다(도메인 상태값 자체는 공유).
    reason: '실제 출차 처리',
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
    // 이 두 번째 처리(PARKING→EXITED)는 차가 돌아오는 "입차 처리"다.
    reason: '실제 입차 처리',
    extraData: { actualExitAt: params.actualExitAt },
    validate: (current) => {
      if (current.actualEntryAt && params.actualExitAt < current.actualEntryAt) {
        throw new ValidationError('입차 시간은 출차 시간 이후여야 합니다.', {
          actualExitAt: ['입차 시간은 출차 시간 이후여야 합니다.'],
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
