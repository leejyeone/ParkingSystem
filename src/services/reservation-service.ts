import {
  ChangedByType,
  Prisma,
  RequesterType,
  ReservationStatus,
  SpaceType,
  type ParkingReservation,
} from '@prisma/client';

import {
  assertReservationTiming,
  checkRequesterCanChange,
  getRequesterChangeDeadline,
} from '@/domain/reservation-rules';
import { assertTransition } from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { formatKstDate } from '@/lib/datetime';
import {
  buildAccessUrl,
  dispatchQuietly,
  sendApprovedEmail,
  sendCancelledEmails,
  sendDoubleParkingNoticeEmails,
  sendNewRequestToAdminEmails,
  sendRejectedEmail,
  sendRequestReceivedEmail,
  sendUpdatedEmails,
  type ReservationForEmail,
} from '@/lib/email/email-service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { maskEmail, maskName, maskPhone, maskVehicleNo } from '@/lib/masking';
import { prisma } from '@/lib/prisma';
import { generateReservationNo } from '@/lib/tokens';
import { normalizeVehicleNo } from '@/lib/vehicle';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import { issueAccessToken } from '@/services/reservation-access-service';
import { getSystemSettings } from '@/services/settings-service';
import {
  findConflictingReservation,
  recommendSpace,
} from '@/services/space-recommendation-service';

/**
 * 예약 도메인 서비스.
 *
 * 화면/Route Handler 는 여기의 함수만 호출하며, 상태 전이·중복 검증·주차면 배정 같은
 * 규칙은 모두 이 계층에서 강제한다.
 */

/** 차량번호 중복 검사 대상 상태 (취소/반려/종료된 예약은 제외) */
const ACTIVE_STATUSES: ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
  ReservationStatus.PARKING,
];

const RESERVATION_WITH_SPACES = {
  recommendedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
  assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
} satisfies Prisma.ParkingReservationInclude;

export type ReservationWithSpaces = Prisma.ParkingReservationGetPayload<{
  include: typeof RESERVATION_WITH_SPACES;
}>;

// ---------------------------------------------------------------------------
// 공통 헬퍼
// ---------------------------------------------------------------------------

function toReservationForEmail(reservation: ReservationWithSpaces): ReservationForEmail {
  return {
    reservationId: reservation.reservationId,
    reservationNo: reservation.reservationNo,
    requesterType: reservation.requesterType,
    requesterName: reservation.requesterName,
    requesterEmail: reservation.requesterEmail,
    companyOrBranchName: reservation.companyOrBranchName,
    vehicleNoMasked: reservation.vehicleNoMasked,
    visitStartAt: reservation.visitStartAt,
    visitEndAt: reservation.visitEndAt,
    rejectionReason: reservation.rejectionReason,
    cancelReason: reservation.cancelReason,
    assignedSpace: reservation.assignedSpace
      ? {
          spaceCode: reservation.assignedSpace.spaceCode,
          spaceType: reservation.assignedSpace.spaceType,
        }
      : null,
  };
}

/**
 * 링크가 포함된 메일을 보낼 때마다 새 접근 토큰을 발급한다.
 *
 * 원본 토큰은 DB 에 남지 않으므로 기존 토큰을 재사용할 수 없다.
 * 이전 토큰은 만료 전까지 유효하게 두어(비활성화하지 않음) 과거 메일의 링크도 계속 동작한다.
 */
async function issueAccessUrl(reservationId: number, visitEndAt: Date): Promise<string> {
  const { rawToken } = await issueAccessToken({ reservationId, visitEndAt });
  return buildAccessUrl(rawToken);
}

/** 동일 차량번호의 시간대 중복 예약 검사 */
async function assertNoVehicleOverlap(
  params: {
    vehicleNo: string;
    visitStartAt: Date;
    visitEndAt: Date;
    excludeReservationId?: number;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const duplicated = await db.parkingReservation.findFirst({
    where: {
      vehicleNo: params.vehicleNo,
      reservationStatus: { in: ACTIVE_STATUSES },
      ...buildOverlapWhere(params.visitStartAt, params.visitEndAt),
      ...(params.excludeReservationId
        ? { reservationId: { not: params.excludeReservationId } }
        : {}),
    },
    select: { reservationId: true },
  });

  if (duplicated) {
    throw new ConflictError(
      '해당 시간대에 동일한 차량번호로 등록된 예약이 이미 있습니다.',
      'VEHICLE_TIME_CONFLICT',
    );
  }
}

/** 승인/배정 시 대상 주차면 행을 잠가 동시 승인 경합을 막는다. */
async function lockSpaceRow(tx: Prisma.TransactionClient, spaceId: number): Promise<void> {
  await tx.$queryRaw`SELECT space_id FROM parking_spaces WHERE space_id = ${spaceId} FOR UPDATE`;
}

async function loadReservationOrThrow(
  reservationId: number,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ReservationWithSpaces> {
  const reservation = await db.parkingReservation.findUnique({
    where: { reservationId },
    include: RESERVATION_WITH_SPACES,
  });
  if (!reservation) {
    throw new NotFoundError('예약 정보를 찾을 수 없습니다.');
  }
  return reservation;
}

// ---------------------------------------------------------------------------
// 1. 예약 신청 (비로그인 공개 API)
// ---------------------------------------------------------------------------

export type CreateReservationInput = {
  requesterType: RequesterType;
  companyOrBranchName: string;
  departmentName?: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  vehicleNo: string;
  visitPurpose?: string | null;
  requestMemo?: string | null;
  visitStartAt: Date;
  visitEndAt: Date;
  privacyConsent: boolean;
};

export async function createReservation(input: CreateReservationInput): Promise<{
  reservation: ReservationWithSpaces;
  accessUrl: string;
}> {
  if (!input.privacyConsent) {
    throw new ValidationError('개인정보 수집 및 이용에 동의해야 신청할 수 있습니다.', {
      privacyConsent: ['개인정보 수집 및 이용에 동의해 주세요.'],
    });
  }

  const settings = await getSystemSettings();
  const now = new Date();

  assertReservationTiming({
    visitStartAt: input.visitStartAt,
    visitEndAt: input.visitEndAt,
    now,
    settings,
  });

  const vehicleNo = normalizeVehicleNo(input.vehicleNo);
  await assertNoVehicleOverlap({
    vehicleNo,
    visitStartAt: input.visitStartAt,
    visitEndAt: input.visitEndAt,
  });

  const reservation = await createWithUniqueReservationNo(
    async (reservationNo, tx) => {
      const recommended = await recommendSpace(
        {
          visitStartAt: input.visitStartAt,
          visitEndAt: input.visitEndAt,
          doubleParkingEnabled: settings.doubleParkingEnabled,
        },
        tx,
      );

      const created = await tx.parkingReservation.create({
        data: {
          reservationNo,
          requesterType: input.requesterType,
          companyOrBranchName: input.companyOrBranchName,
          departmentName: input.departmentName ?? null,
          requesterName: input.requesterName,
          requesterEmail: input.requesterEmail,
          requesterPhone: input.requesterPhone,
          vehicleNo,
          vehicleNoMasked: maskVehicleNo(vehicleNo),
          visitPurpose: input.visitPurpose ?? null,
          requestMemo: input.requestMemo ?? null,
          visitStartAt: input.visitStartAt,
          visitEndAt: input.visitEndAt,
          recommendedSpaceId: recommended?.spaceId ?? null,
          reservationStatus: ReservationStatus.REQUESTED,
          privacyConsentAt: now,
        },
        include: RESERVATION_WITH_SPACES,
      });

      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: created.reservationId,
          previousStatus: null,
          currentStatus: ReservationStatus.REQUESTED,
          changedByType: ChangedByType.REQUESTER,
          changeReason: '신규 주차 예약 신청',
        },
      });

      return created;
    },
    formatKstDate(input.visitStartAt, settings.appTimeZone),
  );

  const accessUrl = await issueAccessUrl(reservation.reservationId, reservation.visitEndAt);

  const forEmail = toReservationForEmail(reservation);
  await dispatchQuietly(
    Promise.all([
      sendRequestReceivedEmail(forEmail, {
        accessUrl,
        changeDeadlineAt: getRequesterChangeDeadline(
          reservation.visitStartAt,
          settings.reservationMinLeadMinutes,
        ),
      }),
      sendNewRequestToAdminEmails(forEmail),
    ]),
  );

  return { reservation, accessUrl };
}

/** 예약번호 유니크 충돌 시 재시도하며 트랜잭션을 실행한다. */
async function createWithUniqueReservationNo(
  handler: (reservationNo: string, tx: Prisma.TransactionClient) => Promise<ReservationWithSpaces>,
  dateString: string,
  maxAttempts = 5,
): Promise<ReservationWithSpaces> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const reservationNo = generateReservationNo(dateString);
      return await prisma.$transaction((tx) => handler(reservationNo, tx));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('reservation_no')
      ) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('예약번호 생성에 실패했습니다.');
}

// ---------------------------------------------------------------------------
// 2. 신청자 수정 / 취소 (이메일 토큰 기반)
// ---------------------------------------------------------------------------

export type UpdateReservationInput = {
  companyOrBranchName: string;
  departmentName?: string | null;
  requesterName: string;
  requesterPhone: string;
  vehicleNo: string;
  visitPurpose?: string | null;
  requestMemo?: string | null;
  visitStartAt: Date;
  visitEndAt: Date;
};

/**
 * 신청자 예약 수정.
 *
 * 승인 완료 상태에서 수정하면
 *   1) assigned_space_id 해제 2) recommended_space_id 재계산
 *   3) 상태를 REQUESTED 로 복귀 4) 상태 이력 저장 5) 변경 메일 발송
 */
export async function updateReservationByRequester(
  reservationId: number,
  input: UpdateReservationInput,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();
  const now = new Date();

  const current = await loadReservationOrThrow(reservationId);

  const changeCheck = checkRequesterCanChange({
    status: current.reservationStatus,
    visitStartAt: current.visitStartAt,
    now,
    minLeadMinutes: settings.reservationMinLeadMinutes,
  });
  if (!changeCheck.allowed) {
    throw new ConflictError(changeCheck.reason, 'CHANGE_NOT_ALLOWED');
  }

  assertReservationTiming({
    visitStartAt: input.visitStartAt,
    visitEndAt: input.visitEndAt,
    now,
    settings,
  });

  const vehicleNo = normalizeVehicleNo(input.vehicleNo);
  await assertNoVehicleOverlap({
    vehicleNo,
    visitStartAt: input.visitStartAt,
    visitEndAt: input.visitEndAt,
    excludeReservationId: reservationId,
  });

  const previousVisitStartAt = current.visitStartAt;
  const previousVisitEndAt = current.visitEndAt;

  const updated = await prisma.$transaction(async (tx) => {
    const recommended = await recommendSpace(
      {
        visitStartAt: input.visitStartAt,
        visitEndAt: input.visitEndAt,
        excludeReservationId: reservationId,
        doubleParkingEnabled: settings.doubleParkingEnabled,
      },
      tx,
    );

    const result = await tx.parkingReservation.update({
      where: { reservationId },
      data: {
        companyOrBranchName: input.companyOrBranchName,
        departmentName: input.departmentName ?? null,
        requesterName: input.requesterName,
        requesterPhone: input.requesterPhone,
        vehicleNo,
        vehicleNoMasked: maskVehicleNo(vehicleNo),
        visitPurpose: input.visitPurpose ?? null,
        requestMemo: input.requestMemo ?? null,
        visitStartAt: input.visitStartAt,
        visitEndAt: input.visitEndAt,
        // 승인 상태였다면 배정 해제 후 다시 승인 대기로 되돌린다.
        assignedSpaceId: null,
        recommendedSpaceId: recommended?.spaceId ?? null,
        reservationStatus: ReservationStatus.REQUESTED,
        approvalAdminId: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: ReservationStatus.REQUESTED,
        changedByType: ChangedByType.REQUESTER,
        changeReason: '신청자 예약 변경으로 승인 대기 상태로 복귀',
      },
    });

    await tx.reservationAccessToken.updateMany({
      where: { reservationId, isActive: true },
      data: { expiresAt: new Date(input.visitEndAt.getTime() + 7 * 24 * 60 * 60 * 1000) },
    });

    return result;
  });

  const accessUrl = await issueAccessUrl(updated.reservationId, updated.visitEndAt);
  await dispatchQuietly(
    sendUpdatedEmails(toReservationForEmail(updated), {
      accessUrl,
      previousVisitStartAt,
      previousVisitEndAt,
    }),
  );

  return updated;
}

/** 신청자 예약 취소 */
export async function cancelReservationByRequester(
  reservationId: number,
  cancelReason: string,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();
  const now = new Date();
  const current = await loadReservationOrThrow(reservationId);

  const changeCheck = checkRequesterCanChange({
    status: current.reservationStatus,
    visitStartAt: current.visitStartAt,
    now,
    minLeadMinutes: settings.reservationMinLeadMinutes,
  });
  if (!changeCheck.allowed) {
    throw new ConflictError(changeCheck.reason, 'CHANGE_NOT_ALLOWED');
  }

  assertTransition(current.reservationStatus, ReservationStatus.CANCELLED);

  const cancelled = await prisma.$transaction(async (tx) => {
    const result = await tx.parkingReservation.update({
      where: { reservationId },
      data: {
        reservationStatus: ReservationStatus.CANCELLED,
        cancelledAt: now,
        cancelReason,
        assignedSpaceId: null,
        recommendedSpaceId: null,
      },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: ReservationStatus.CANCELLED,
        changedByType: ChangedByType.REQUESTER,
        changeReason: cancelReason,
      },
    });

    return result;
  });

  await dispatchQuietly(sendCancelledEmails(toReservationForEmail(cancelled)));
  return cancelled;
}

// ---------------------------------------------------------------------------
// 3. 관리자 처리
// ---------------------------------------------------------------------------

export type AdminActionContext = {
  adminUserId: number;
  requestContext?: RequestContext;
};

/**
 * 예약 승인 + 주차면 확정.
 *
 * - 승인과 주차면 배정은 하나의 트랜잭션에서 원자적으로 처리한다.
 * - 트랜잭션 안에서 대상 주차면 행을 잠그고(FOR UPDATE) 시간 중복을 다시 검증한다.
 */
export async function approveReservation(
  params: { reservationId: number; spaceId?: number | null } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();

  const approved = await prisma.$transaction(async (tx) => {
    const current = await loadReservationOrThrow(params.reservationId, tx);
    assertTransition(current.reservationStatus, ReservationStatus.APPROVED);

    let targetSpaceId = params.spaceId ?? current.recommendedSpaceId ?? null;

    if (!targetSpaceId) {
      const recommended = await recommendSpace(
        {
          visitStartAt: current.visitStartAt,
          visitEndAt: current.visitEndAt,
          excludeReservationId: current.reservationId,
          doubleParkingEnabled: settings.doubleParkingEnabled,
        },
        tx,
      );
      targetSpaceId = recommended?.spaceId ?? null;
    }

    if (!targetSpaceId) {
      throw new ConflictError(
        '해당 시간대에 배정 가능한 주차면이 없습니다. 시간 조정 후 다시 시도하거나 반려 처리해 주세요.',
        'NO_AVAILABLE_SPACE',
      );
    }

    await lockSpaceRow(tx, targetSpaceId);
    await assertSpaceAssignable(tx, targetSpaceId, settings.doubleParkingEnabled);

    const conflict = await findConflictingReservation(
      {
        spaceId: targetSpaceId,
        visitStartAt: current.visitStartAt,
        visitEndAt: current.visitEndAt,
        excludeReservationId: current.reservationId,
      },
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        `선택하신 주차면은 해당 시간대에 이미 배정되어 있습니다. (예약번호 ${conflict.reservationNo})`,
        'SPACE_TIME_CONFLICT',
      );
    }

    const result = await tx.parkingReservation.update({
      where: { reservationId: params.reservationId },
      data: {
        reservationStatus: ReservationStatus.APPROVED,
        assignedSpaceId: targetSpaceId,
        approvalAdminId: params.adminUserId,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId: params.reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: ReservationStatus.APPROVED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: `주차면 ${result.assignedSpace?.spaceCode ?? '-'} 배정 후 승인`,
      },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_APPROVE,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: approved.reservationId,
    detail: {
      reservationNo: approved.reservationNo,
      assignedSpaceCode: approved.assignedSpace?.spaceCode ?? null,
      spaceType: approved.assignedSpace?.spaceType ?? null,
    },
    context: params.requestContext,
  });

  const accessUrl = await issueAccessUrl(approved.reservationId, approved.visitEndAt);
  const forEmail = toReservationForEmail(approved);

  await dispatchQuietly(
    (async () => {
      await sendApprovedEmail(forEmail, { accessUrl });
      if (approved.assignedSpace?.spaceType === SpaceType.DOUBLE) {
        await sendDoubleParkingNoticeEmails(forEmail, { accessUrl });
      }
    })(),
  );

  return approved;
}

async function assertSpaceAssignable(
  tx: Prisma.TransactionClient,
  spaceId: number,
  doubleParkingEnabled: boolean,
): Promise<void> {
  const space = await tx.parkingSpace.findUnique({
    where: { spaceId },
    select: {
      spaceId: true,
      spaceCode: true,
      spaceType: true,
      isActive: true,
      area: { select: { isActive: true } },
    },
  });

  if (!space || !space.isActive || !space.area.isActive) {
    throw new ConflictError('사용할 수 없는 주차면입니다.', 'SPACE_NOT_AVAILABLE');
  }
  if (space.spaceType === SpaceType.UNAVAILABLE) {
    throw new ConflictError(
      `${space.spaceCode} 은(는) 사용 불가로 지정된 주차면입니다.`,
      'SPACE_NOT_AVAILABLE',
    );
  }
  if (space.spaceType === SpaceType.DOUBLE && !doubleParkingEnabled) {
    throw new ConflictError(
      '현재 시스템 설정에서 이중주차 사용이 비활성화되어 있습니다.',
      'DOUBLE_PARKING_DISABLED',
    );
  }
}

/** 예약 반려 */
export async function rejectReservation(
  params: { reservationId: number; rejectionReason: string } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const rejected = await prisma.$transaction(async (tx) => {
    const current = await loadReservationOrThrow(params.reservationId, tx);
    assertTransition(current.reservationStatus, ReservationStatus.REJECTED);

    const result = await tx.parkingReservation.update({
      where: { reservationId: params.reservationId },
      data: {
        reservationStatus: ReservationStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: params.rejectionReason,
        assignedSpaceId: null,
        recommendedSpaceId: null,
        approvalAdminId: params.adminUserId,
      },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId: params.reservationId,
        previousStatus: current.reservationStatus,
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
    actionType: AUDIT_ACTIONS.RESERVATION_REJECT,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: rejected.reservationId,
    detail: { reservationNo: rejected.reservationNo },
    context: params.requestContext,
  });

  await dispatchQuietly(sendRejectedEmail(toReservationForEmail(rejected)));
  return rejected;
}

/** 배정 주차면 변경 (승인/입차 상태에서만 가능) */
export async function changeAssignedSpace(
  params: { reservationId: number; spaceId: number } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();

  const { updated, previousSpaceCode } = await prisma.$transaction(async (tx) => {
    const current = await loadReservationOrThrow(params.reservationId, tx);

    if (
      current.reservationStatus !== ReservationStatus.APPROVED &&
      current.reservationStatus !== ReservationStatus.PARKING
    ) {
      throw new ConflictError(
        '승인 완료 또는 입차 상태의 예약만 주차 위치를 변경할 수 있습니다.',
        'SPACE_CHANGE_NOT_ALLOWED',
      );
    }

    await lockSpaceRow(tx, params.spaceId);
    await assertSpaceAssignable(tx, params.spaceId, settings.doubleParkingEnabled);

    const conflict = await findConflictingReservation(
      {
        spaceId: params.spaceId,
        visitStartAt: current.visitStartAt,
        visitEndAt: current.visitEndAt,
        excludeReservationId: current.reservationId,
      },
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        `선택하신 주차면은 해당 시간대에 이미 배정되어 있습니다. (예약번호 ${conflict.reservationNo})`,
        'SPACE_TIME_CONFLICT',
      );
    }

    const result = await tx.parkingReservation.update({
      where: { reservationId: params.reservationId },
      data: { assignedSpaceId: params.spaceId },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId: params.reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: current.reservationStatus,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: `주차 위치 변경: ${current.assignedSpace?.spaceCode ?? '-'} → ${
          result.assignedSpace?.spaceCode ?? '-'
        }`,
      },
    });

    return { updated: result, previousSpaceCode: current.assignedSpace?.spaceCode ?? null };
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_SPACE_CHANGE,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: {
      reservationNo: updated.reservationNo,
      from: previousSpaceCode,
      to: updated.assignedSpace?.spaceCode ?? null,
    },
    context: params.requestContext,
  });

  const accessUrl = await issueAccessUrl(updated.reservationId, updated.visitEndAt);
  const forEmail = toReservationForEmail(updated);
  await dispatchQuietly(
    (async () => {
      await sendApprovedEmail(forEmail, { accessUrl });
      if (updated.assignedSpace?.spaceType === SpaceType.DOUBLE) {
        await sendDoubleParkingNoticeEmails(forEmail, { accessUrl });
      }
    })(),
  );

  return updated;
}

/** 실제 입차 처리 */
export async function markEntry(
  params: { reservationId: number } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const updated = await changeStatusByAdmin({
    reservationId: params.reservationId,
    nextStatus: ReservationStatus.PARKING,
    adminUserId: params.adminUserId,
    reason: '실제 입차 처리',
    extraData: { actualEntryAt: new Date() },
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_ENTRY,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: { reservationNo: updated.reservationNo },
    context: params.requestContext,
  });

  return updated;
}

/** 실제 출차 처리 */
export async function markExit(
  params: { reservationId: number } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const updated = await changeStatusByAdmin({
    reservationId: params.reservationId,
    nextStatus: ReservationStatus.EXITED,
    adminUserId: params.adminUserId,
    reason: '실제 출차 처리',
    extraData: { actualExitAt: new Date() },
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_EXIT,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: { reservationNo: updated.reservationNo },
    context: params.requestContext,
  });

  return updated;
}

/** 미방문(NO_SHOW) 처리 */
export async function markNoShow(
  params: { reservationId: number; reason?: string } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const updated = await changeStatusByAdmin({
    reservationId: params.reservationId,
    nextStatus: ReservationStatus.NO_SHOW,
    adminUserId: params.adminUserId,
    reason: params.reason ?? '예약 시간 종료 후 미입차',
    extraData: { assignedSpaceId: null },
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_NO_SHOW,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: { reservationNo: updated.reservationNo },
    context: params.requestContext,
  });

  return updated;
}

async function changeStatusByAdmin(params: {
  reservationId: number;
  nextStatus: ReservationStatus;
  adminUserId: number;
  reason: string;
  extraData?: Prisma.ParkingReservationUncheckedUpdateInput;
}): Promise<ReservationWithSpaces> {
  return prisma.$transaction(async (tx) => {
    const current = await loadReservationOrThrow(params.reservationId, tx);
    assertTransition(current.reservationStatus, params.nextStatus);

    const result = await tx.parkingReservation.update({
      where: { reservationId: params.reservationId },
      data: { reservationStatus: params.nextStatus, ...params.extraData },
      include: RESERVATION_WITH_SPACES,
    });

    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId: params.reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: params.nextStatus,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: params.adminUserId,
        changeReason: params.reason,
      },
    });

    return result;
  });
}

// ---------------------------------------------------------------------------
// 4. 조회
// ---------------------------------------------------------------------------

export type ReservationListFilter = {
  date?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: ReservationStatus;
  requesterType?: RequesterType;
  vehicleNo?: string;
  requesterName?: string;
  spaceCode?: string;
  page?: number;
  pageSize?: number;
};

/** 관리자 목록용 (개인정보 마스킹 적용) */
export type MaskedReservationListItem = {
  reservationId: number;
  reservationNo: string;
  requesterType: RequesterType;
  reservationStatus: ReservationStatus;
  companyOrBranchName: string;
  requesterNameMasked: string;
  requesterEmailMasked: string;
  requesterPhoneMasked: string;
  vehicleNoMasked: string;
  visitStartAt: Date;
  visitEndAt: Date;
  recommendedSpaceCode: string | null;
  assignedSpaceCode: string | null;
  assignedSpaceType: SpaceType | null;
  createdAt: Date;
};

export async function listReservationsForAdmin(filter: ReservationListFilter): Promise<{
  items: MaskedReservationListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const where: Prisma.ParkingReservationWhereInput = {
    ...(filter.dateFrom && filter.dateTo
      ? { visitStartAt: { lt: filter.dateTo }, visitEndAt: { gt: filter.dateFrom } }
      : {}),
    ...(filter.status ? { reservationStatus: filter.status } : {}),
    ...(filter.requesterType ? { requesterType: filter.requesterType } : {}),
    ...(filter.vehicleNo ? { vehicleNo: { contains: normalizeVehicleNo(filter.vehicleNo) } } : {}),
    ...(filter.requesterName ? { requesterName: { contains: filter.requesterName } } : {}),
    ...(filter.spaceCode ? { assignedSpace: { spaceCode: { contains: filter.spaceCode } } } : {}),
  };

  const [totalCount, rows] = await Promise.all([
    prisma.parkingReservation.count({ where }),
    prisma.parkingReservation.findMany({
      where,
      include: RESERVATION_WITH_SPACES,
      orderBy: [{ visitStartAt: 'asc' }, { reservationId: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(toMaskedListItem),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export function toMaskedListItem(reservation: ReservationWithSpaces): MaskedReservationListItem {
  return {
    reservationId: reservation.reservationId,
    reservationNo: reservation.reservationNo,
    requesterType: reservation.requesterType,
    reservationStatus: reservation.reservationStatus,
    companyOrBranchName: reservation.companyOrBranchName,
    requesterNameMasked: maskName(reservation.requesterName),
    requesterEmailMasked: maskEmail(reservation.requesterEmail),
    requesterPhoneMasked: maskPhone(reservation.requesterPhone),
    vehicleNoMasked: reservation.vehicleNoMasked,
    visitStartAt: reservation.visitStartAt,
    visitEndAt: reservation.visitEndAt,
    recommendedSpaceCode: reservation.recommendedSpace?.spaceCode ?? null,
    assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
    assignedSpaceType: reservation.assignedSpace?.spaceType ?? null,
    createdAt: reservation.createdAt,
  };
}

/**
 * 관리자 상세 조회. 개인정보 원문이 포함되므로 반드시 감사 로그를 남긴다.
 */
export async function getReservationDetailForAdmin(
  reservationId: number,
  actor: AdminActionContext,
): Promise<
  ReservationWithSpaces & {
    statusLogs: {
      statusLogId: number;
      previousStatus: ReservationStatus | null;
      currentStatus: ReservationStatus;
      changedByType: ChangedByType;
      changeReason: string | null;
      createdAt: Date;
      adminName: string | null;
    }[];
  }
> {
  const reservation = await prisma.parkingReservation.findUnique({
    where: { reservationId },
    include: {
      ...RESERVATION_WITH_SPACES,
      statusLogs: {
        orderBy: { createdAt: 'asc' },
        include: { changedByAdmin: { select: { adminName: true } } },
      },
    },
  });

  if (!reservation) {
    throw new NotFoundError('예약 정보를 찾을 수 없습니다.');
  }

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_DETAIL_VIEW,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: reservationId,
    detail: { reservationNo: reservation.reservationNo },
    context: actor.requestContext,
  });

  return {
    ...reservation,
    statusLogs: reservation.statusLogs.map((log) => ({
      statusLogId: log.statusLogId,
      previousStatus: log.previousStatus,
      currentStatus: log.currentStatus,
      changedByType: log.changedByType,
      changeReason: log.changeReason,
      createdAt: log.createdAt,
      adminName: log.changedByAdmin?.adminName ?? null,
    })),
  };
}

/** 신청자(토큰 소유자)에게 보여줄 예약 1건 */
export async function getReservationForRequester(reservationId: number): Promise<
  ReservationWithSpaces & {
    changeDeadlineAt: Date;
    canChange: boolean;
    changeBlockedReason: string | null;
  }
> {
  const settings = await getSystemSettings();
  const reservation = await loadReservationOrThrow(reservationId);
  const now = new Date();

  const check = checkRequesterCanChange({
    status: reservation.reservationStatus,
    visitStartAt: reservation.visitStartAt,
    now,
    minLeadMinutes: settings.reservationMinLeadMinutes,
  });

  return {
    ...reservation,
    changeDeadlineAt: getRequesterChangeDeadline(
      reservation.visitStartAt,
      settings.reservationMinLeadMinutes,
    ),
    canChange: check.allowed,
    changeBlockedReason: check.allowed ? null : check.reason,
  };
}

export type { ParkingReservation };
