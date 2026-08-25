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
  checkOperatingHours,
  checkRequesterCanChange,
  checkVisitRange,
  getRequesterChangeDeadline,
} from '@/domain/reservation-rules';
import {
  assertTransition,
  isTerminalStatus,
  resolveDisplayStatus,
  RESERVATION_STATUS_LABEL,
  SPACE_OCCUPYING_STATUSES,
  type DisplayReservationStatus,
} from '@/domain/reservation-status';
import { buildOverlapWhere } from '@/domain/time-overlap';
import { formatKstDate, formatKstDateTime, formatKstRange } from '@/lib/datetime';
import {
  buildAccessUrl,
  dispatchQuietly,
  sendApprovedEmail,
  sendCancelledEmails,
  sendNewRequestToAdminEmails,
  sendRejectedEmail,
  sendRequestReceivedEmail,
  sendUpdatedEmails,
  type ReservationForEmail,
} from '@/lib/email/email-service';
import { ConflictError, NotFoundError, ValidationError, type FieldErrors } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { generateReservationNo } from '@/lib/tokens';
import { normalizeVehicleNo } from '@/lib/vehicle';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import { issueAccessToken } from '@/services/reservation-access-service';
import { SETTING_KEYS } from '@/domain/system-settings';
import { getSystemSettings } from '@/services/settings-service';
import {
  findConflictingReservation,
  pickAvailableSpace,
} from '@/services/space-assignment-service';

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
    vehicleNo: reservation.vehicleNo,
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

/**
 * 주차면 배정을 쓰지 않을 때 정원 판정을 직렬화하기 위한 잠금.
 *
 * 배정을 쓸 때는 주차면 행을 잠가 경합을 막지만, 배정을 쓰지 않으면 잠글 대상이 없다.
 * 정원 설정 행 하나를 잠가 동시 승인이 같은 시간대 정원을 함께 통과하는 것을 막는다.
 */
async function lockCapacitySetting(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT setting_key FROM system_settings WHERE setting_key = ${SETTING_KEYS.PARKING_CAPACITY} FOR UPDATE`;
}

/**
 * 해당 시간대에 이미 자리를 차지하고 있는 예약 수.
 * (승인 완료 + 입차 상태 = 실제로 주차장에 있게 되는 차량)
 */
export async function countOverlappingReservations(
  params: { visitStartAt: Date; visitEndAt: Date; excludeReservationId?: number },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  return db.parkingReservation.count({
    where: {
      reservationStatus: { in: [...SPACE_OCCUPYING_STATUSES] },
      ...buildOverlapWhere(params.visitStartAt, params.visitEndAt),
      ...(params.excludeReservationId
        ? { reservationId: { not: params.excludeReservationId } }
        : {}),
    },
  });
}

/**
 * 특정 시간대의 정원 사용 현황.
 * 주차면 배정을 쓰지 않는 운영에서 관리자 화면이 잔여 대수를 보여주는 데 사용한다.
 */
export async function getCapacityUsage(params: {
  visitStartAt: Date;
  visitEndAt: Date;
  excludeReservationId?: number;
}): Promise<{ used: number; capacity: number; remaining: number }> {
  const settings = await getSystemSettings();
  const used = await countOverlappingReservations(params);
  return {
    used,
    capacity: settings.parkingCapacity,
    remaining: Math.max(0, settings.parkingCapacity - used),
  };
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
  requesterName: string;
  requesterEmail: string;
  vehicleNo: string;
  /** 로그인 회원이 신청한 경우에만 채운다. 비로그인 신청은 undefined/null. */
  userId?: number | null;
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
      const created = await tx.parkingReservation.create({
        data: {
          reservationNo,
          userId: input.userId ?? null,
          requesterType: input.requesterType,
          companyOrBranchName: input.companyOrBranchName,
          requesterName: input.requesterName,
          requesterEmail: input.requesterEmail,
          vehicleNo,
          visitPurpose: input.visitPurpose ?? null,
          requestMemo: input.requestMemo ?? null,
          visitStartAt: input.visitStartAt,
          visitEndAt: input.visitEndAt,
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
          changeReason: '신규 방문 예약 신청',
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
  requesterName: string;
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
 *   1) assigned_space_id 해제 2) 상태를 REQUESTED 로 복귀
 *   3) 상태 이력 저장 4) 변경 메일 발송
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
    const result = await tx.parkingReservation.update({
      where: { reservationId },
      data: {
        companyOrBranchName: input.companyOrBranchName,
        requesterName: input.requesterName,
        vehicleNo,
        visitPurpose: input.visitPurpose ?? null,
        requestMemo: input.requestMemo ?? null,
        visitStartAt: input.visitStartAt,
        visitEndAt: input.visitEndAt,
        // 승인 상태였다면 배정 해제 후 다시 승인 대기로 되돌린다.
        assignedSpaceId: null,
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

/**
 * 관리자 예약 수정.
 *
 * 신청자는 승인 대기 상태에서 마감 시각 전까지만 스스로 수정할 수 있다.
 * 그 외의 경우(승인 완료, 마감 시각 경과)에는 담당자에게 문의하도록 안내하므로,
 * 관리자에게는 그 문의를 실제로 처리할 수 있는 수정 경로가 있어야 한다.
 *
 * 신청자 수정과 다른 점
 *  - 최소 사전 신청 시간(마감 시각) 제한을 받지 않는다. 임박한 예약을 고치는 것이 목적이다.
 *  - 상태를 승인 대기로 되돌리지 않는다. 관리자가 곧 승인 주체이므로 재승인이 불필요하다.
 *  - 이미 배정된 주차면은 유지하되, 바뀐 시간대에 충돌이 없는지 다시 검증한다.
 */
export async function updateReservationByAdmin(
  reservationId: number,
  input: UpdateReservationInput,
  actor: AdminActionContext,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();
  const current = await loadReservationOrThrow(reservationId);

  if (isTerminalStatus(current.reservationStatus)) {
    throw new ConflictError(
      `종료된 예약(${RESERVATION_STATUS_LABEL[current.reservationStatus]})은 수정할 수 없습니다.`,
      'RESERVATION_TERMINAL',
    );
  }

  // 운영시간·최대 이용시간·시작<종료 는 그대로 적용하고, 최소 사전 신청 시간만 면제한다.
  const fieldErrors: FieldErrors = {};
  const rangeError = checkVisitRange(
    input.visitStartAt,
    input.visitEndAt,
    settings.maxReservationHours,
  );
  if (rangeError) (fieldErrors.visitEndAt ??= []).push(rangeError);
  if (!rangeError) {
    const hoursError = checkOperatingHours(
      input.visitStartAt,
      input.visitEndAt,
      settings.parkingOpenTime,
      settings.parkingCloseTime,
      settings.appTimeZone,
    );
    if (hoursError) (fieldErrors.visitStartAt ??= []).push(hoursError);
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('예약 시간을 다시 확인해 주세요.', fieldErrors);
  }

  const vehicleNo = normalizeVehicleNo(input.vehicleNo);
  await assertNoVehicleOverlap({
    vehicleNo,
    visitStartAt: input.visitStartAt,
    visitEndAt: input.visitEndAt,
    excludeReservationId: reservationId,
  });

  const previousVisitStartAt = current.visitStartAt;
  const previousVisitEndAt = current.visitEndAt;
  const timeChanged =
    previousVisitStartAt.getTime() !== input.visitStartAt.getTime() ||
    previousVisitEndAt.getTime() !== input.visitEndAt.getTime();
  const occupiesSpace = SPACE_OCCUPYING_STATUSES.includes(current.reservationStatus);

  const updated = await prisma.$transaction(async (tx) => {
    // 이미 자리를 차지하는 예약의 시간이 바뀌면 새 시간대에서 다시 검증한다.
    if (timeChanged && occupiesSpace) {
      if (current.assignedSpaceId) {
        await lockSpaceRow(tx, current.assignedSpaceId);
        const conflict = await findConflictingReservation(
          {
            spaceId: current.assignedSpaceId,
            visitStartAt: input.visitStartAt,
            visitEndAt: input.visitEndAt,
            excludeReservationId: reservationId,
          },
          tx,
        );
        if (conflict) {
          throw new ConflictError(
            `배정된 주차면이 변경한 시간대에 이미 사용 중입니다. (예약번호 ${conflict.reservationNo}) ` +
              '주차 위치를 먼저 변경한 뒤 다시 시도해 주세요.',
            'SPACE_TIME_CONFLICT',
          );
        }
      } else if (!settings.spaceAssignmentEnabled) {
        await lockCapacitySetting(tx);
        const used = await countOverlappingReservations(
          {
            visitStartAt: input.visitStartAt,
            visitEndAt: input.visitEndAt,
            excludeReservationId: reservationId,
          },
          tx,
        );
        if (used >= settings.parkingCapacity) {
          throw new ConflictError(
            `변경한 시간대는 최대 주차 가능 대수(${settings.parkingCapacity}대)가 모두 차 있습니다.`,
            'CAPACITY_EXCEEDED',
          );
        }
      }
    }

    const result = await tx.parkingReservation.update({
      where: { reservationId },
      data: {
        companyOrBranchName: input.companyOrBranchName,
        requesterName: input.requesterName,
        vehicleNo,
        visitPurpose: input.visitPurpose ?? null,
        requestMemo: input.requestMemo ?? null,
        visitStartAt: input.visitStartAt,
        visitEndAt: input.visitEndAt,
      },
      include: RESERVATION_WITH_SPACES,
    });

    // 상태는 그대로지만 내용이 바뀌었으므로 이력에는 남긴다.
    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId,
        previousStatus: current.reservationStatus,
        currentStatus: current.reservationStatus,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: actor.adminUserId,
        changeReason: timeChanged
          ? `관리자 예약 수정 (방문 시간 ${formatKstRange(previousVisitStartAt, previousVisitEndAt)} → ${formatKstRange(input.visitStartAt, input.visitEndAt)})`
          : '관리자 예약 수정',
      },
    });

    await tx.reservationAccessToken.updateMany({
      where: { reservationId, isActive: true },
      data: { expiresAt: new Date(input.visitEndAt.getTime() + 7 * 24 * 60 * 60 * 1000) },
    });

    return result;
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_UPDATE,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    // 개인정보 원문 대신 어떤 항목이 바뀌었는지만 남긴다.
    detail: {
      reservationNo: updated.reservationNo,
      timeChanged,
      vehicleNoChanged: current.vehicleNo !== vehicleNo,
      requesterNameChanged: current.requesterName !== input.requesterName,
      companyChanged: current.companyOrBranchName !== input.companyOrBranchName,
    },
    context: actor.requestContext,
  });

  const accessUrl = await issueAccessUrl(updated.reservationId, updated.visitEndAt);
  await dispatchQuietly(
    sendUpdatedEmails(toReservationForEmail(updated), {
      accessUrl,
      previousVisitStartAt,
      previousVisitEndAt,
      changedByAdmin: true,
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

    // 주차면 배정을 끈 운영에서는 위치를 잡지 않고 "주차 가능"만 승인한다.
    // 대신 시스템 설정의 정원(최대 주차 가능 대수)을 초과하지 않는지 확인한다.
    if (!settings.spaceAssignmentEnabled) {
      await lockCapacitySetting(tx);
      const used = await countOverlappingReservations(
        {
          visitStartAt: current.visitStartAt,
          visitEndAt: current.visitEndAt,
          excludeReservationId: current.reservationId,
        },
        tx,
      );
      if (used >= settings.parkingCapacity) {
        throw new ConflictError(
          `해당 시간대는 최대 주차 가능 대수(${settings.parkingCapacity}대)가 모두 차 있습니다. ` +
            '시간 조정을 요청하거나 반려 처리해 주세요.',
          'CAPACITY_EXCEEDED',
        );
      }
      return approveWithoutSpace(tx, current, params.adminUserId);
    }

    // 관리자가 고르지 않았으면 승인 시점에 빈 자리를 찾는다.
    // (신청 시점 값을 저장해 두면 그 사이 다른 예약이 차지했을 때 낡은 값이 된다)
    let targetSpaceId = params.spaceId ?? null;

    if (!targetSpaceId) {
      const picked = await pickAvailableSpace(
        {
          visitStartAt: current.visitStartAt,
          visitEndAt: current.visitEndAt,
          excludeReservationId: current.reservationId,
          doubleParkingEnabled: settings.doubleParkingEnabled,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
        },
        tx,
      );
      targetSpaceId = picked?.spaceId ?? null;
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
      // 이중주차 배정 안내는 승인 메일 본문에 포함된다. (별도 발송하지 않음)
      await sendApprovedEmail(forEmail, { accessUrl });
    })(),
  );

  return approved;
}

/** 주차면 배정을 사용하지 않는 운영에서의 승인 처리. 주차면을 잡지 않는다. */
async function approveWithoutSpace(
  tx: Prisma.TransactionClient,
  current: ReservationWithSpaces,
  adminUserId: number,
): Promise<ReservationWithSpaces> {
  const result = await tx.parkingReservation.update({
    where: { reservationId: current.reservationId },
    data: {
      reservationStatus: ReservationStatus.APPROVED,
      // 과거에 배정된 위치가 남아 있다면 해제한다. (설정을 끈 뒤 재승인하는 경우)
      assignedSpaceId: null,
      approvalAdminId: adminUserId,
      approvedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null,
    },
    include: RESERVATION_WITH_SPACES,
  });

  await tx.parkingReservationStatusLog.create({
    data: {
      reservationId: current.reservationId,
      previousStatus: current.reservationStatus,
      currentStatus: ReservationStatus.APPROVED,
      changedByType: ChangedByType.ADMIN,
      changedByAdminId: adminUserId,
      changeReason: '주차 가능 승인 (주차면 배정 미사용)',
    },
  });

  return result;
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

export type BulkRejectResult = {
  succeeded: number[];
  failed: { reservationId: number; message: string }[];
};

/**
 * 여러 예약을 같은 사유로 한 번에 반려한다.
 *
 * 한 건씩 순서대로 처리하고 실패한 건은 건너뛴다 — 목록을 고른 뒤 실제 처리 사이에
 * 다른 관리자가 먼저 승인/반려했을 수 있어(REQUESTED 가 아니게 됨), 그런 건만 빼고
 * 나머지는 정상 처리되게 하기 위함이다. rejectReservation 을 그대로 재사용해
 * 감사 로그·이메일 발송 등 단건 반려와 동작이 완전히 같다.
 */
export async function bulkRejectReservations(
  params: { reservationIds: number[]; rejectionReason: string } & AdminActionContext,
): Promise<BulkRejectResult> {
  const result: BulkRejectResult = { succeeded: [], failed: [] };

  for (const reservationId of params.reservationIds) {
    try {
      const rejected = await rejectReservation({
        reservationId,
        rejectionReason: params.rejectionReason,
        adminUserId: params.adminUserId,
        requestContext: params.requestContext,
      });
      result.succeeded.push(rejected.reservationId);
    } catch (error) {
      result.failed.push({
        reservationId,
        message: error instanceof Error ? error.message : '반려 처리에 실패했습니다.',
      });
    }
  }

  return result;
}

/** 배정 주차면 변경 (승인/입차 상태에서만 가능) */
export async function changeAssignedSpace(
  params: { reservationId: number; spaceId: number } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  const settings = await getSystemSettings();

  if (!settings.spaceAssignmentEnabled) {
    throw new ConflictError(
      '현재 시스템 설정에서 주차면 배정을 사용하지 않습니다.',
      'SPACE_ASSIGNMENT_DISABLED',
    );
  }

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
    })(),
  );

  return updated;
}

/** 입·출차/미방문 처리가 꺼져 있으면 호출 자체를 막는다. (시스템 설정, 관리자가 켠다) */
async function assertEntryExitEnabled(): Promise<void> {
  const settings = await getSystemSettings();
  if (!settings.entryExitManagementEnabled) {
    throw new ConflictError(
      '입·출차 및 미방문 처리는 현재 사용하지 않는 기능입니다.',
      'ENTRY_EXIT_DISABLED',
    );
  }
}

/** 실제 입차 처리 */
export async function markEntry(
  params: { reservationId: number; actualEntryAt: Date } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  await assertEntryExitEnabled();

  const updated = await changeStatusByAdmin({
    reservationId: params.reservationId,
    nextStatus: ReservationStatus.PARKING,
    adminUserId: params.adminUserId,
    reason: '실제 입차 처리',
    extraData: { actualEntryAt: params.actualEntryAt },
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
  params: { reservationId: number; actualExitAt: Date } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  await assertEntryExitEnabled();

  const updated = await changeStatusByAdmin({
    reservationId: params.reservationId,
    nextStatus: ReservationStatus.EXITED,
    adminUserId: params.adminUserId,
    reason: '실제 출차 처리',
    extraData: { actualExitAt: params.actualExitAt },
    // 관리자가 시간을 직접 입력하므로, 입차보다 이른 출차를 방지한다.
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
    actionType: AUDIT_ACTIONS.RESERVATION_EXIT,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: { reservationNo: updated.reservationNo },
    context: params.requestContext,
  });

  return updated;
}

/**
 * 실제 입·출차 기록 수정/삭제.
 *
 * 버튼을 잘못 눌러 시각이 틀리게 기록됐거나, 애초에 처리 자체가 잘못된 경우(차가 안
 * 들어왔는데 입차 처리를 눌렀다 등)를 바로잡는다.
 *
 *  - 값을 문자열로 보내면: 상태는 그대로 두고 시각만 고친다.
 *  - null 을 보내면: 그 기록을 지우고 상태를 한 단계 되돌린다.
 *    (출차 기록 삭제 → EXITED to PARKING, 입차 기록 삭제 → PARKING to APPROVED)
 *    입차 기록을 지우려면 먼저 출차 기록부터 지워야 한다 — 출차 기록이 남아 있는데
 *    입차 기록이 없어지는 모순을 막기 위함이다. 다만 한 번의 호출에 두 값을 함께 null 로
 *    보내면(EXITED 상태에서 둘 다 지우는 경우) 출차 → 입차 순서로 한 트랜잭션에서 처리하므로
 *    문제없다.
 *  - 필드를 아예 보내지 않으면(undefined) 그 기록은 건드리지 않는다.
 */
export async function updateEntryExitRecords(
  params: {
    reservationId: number;
    actualEntryAt?: Date | null;
    actualExitAt?: Date | null;
  } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  await assertEntryExitEnabled();

  const updated = await prisma.$transaction(async (tx) => {
    let current = await loadReservationOrThrow(params.reservationId, tx);

    if (params.actualExitAt !== undefined) {
      if (current.reservationStatus !== ReservationStatus.EXITED) {
        throw new ConflictError(
          '출차 처리된 예약만 출차 기록을 수정할 수 있습니다.',
          'RESERVATION_NOT_EXITED',
        );
      }

      if (params.actualExitAt === null) {
        current = await tx.parkingReservation.update({
          where: { reservationId: params.reservationId },
          data: { reservationStatus: ReservationStatus.PARKING, actualExitAt: null },
          include: RESERVATION_WITH_SPACES,
        });
        await tx.parkingReservationStatusLog.create({
          data: {
            reservationId: params.reservationId,
            previousStatus: ReservationStatus.EXITED,
            currentStatus: ReservationStatus.PARKING,
            changedByType: ChangedByType.ADMIN,
            changedByAdminId: params.adminUserId,
            changeReason: '출차 기록 삭제(관리자 정정) — 출차 처리 이전 상태로 되돌림',
          },
        });
      } else {
        if (current.actualEntryAt && params.actualExitAt < current.actualEntryAt) {
          throw new ValidationError('출차 시간은 입차 시간 이후여야 합니다.', {
            actualExitAt: ['출차 시간은 입차 시간 이후여야 합니다.'],
          });
        }
        const previousExit = current.actualExitAt;
        current = await tx.parkingReservation.update({
          where: { reservationId: params.reservationId },
          data: { actualExitAt: params.actualExitAt },
          include: RESERVATION_WITH_SPACES,
        });
        await tx.parkingReservationStatusLog.create({
          data: {
            reservationId: params.reservationId,
            previousStatus: current.reservationStatus,
            currentStatus: current.reservationStatus,
            changedByType: ChangedByType.ADMIN,
            changedByAdminId: params.adminUserId,
            changeReason: `출차 시각 수정(관리자 정정): ${
              previousExit ? formatKstDateTime(previousExit) : '-'
            } → ${formatKstDateTime(params.actualExitAt)}`,
          },
        });
      }
    }

    if (params.actualEntryAt !== undefined) {
      if (current.reservationStatus !== ReservationStatus.PARKING) {
        throw new ConflictError(
          '입차 처리된 예약만 입차 기록을 수정할 수 있습니다. (출차 기록이 남아 있다면 먼저 지워 주세요)',
          'RESERVATION_NOT_PARKING',
        );
      }

      if (params.actualEntryAt === null) {
        current = await tx.parkingReservation.update({
          where: { reservationId: params.reservationId },
          data: { reservationStatus: ReservationStatus.APPROVED, actualEntryAt: null },
          include: RESERVATION_WITH_SPACES,
        });
        await tx.parkingReservationStatusLog.create({
          data: {
            reservationId: params.reservationId,
            previousStatus: ReservationStatus.PARKING,
            currentStatus: ReservationStatus.APPROVED,
            changedByType: ChangedByType.ADMIN,
            changedByAdminId: params.adminUserId,
            changeReason:
              '입차 기록 삭제(관리자 정정) — 입차 처리 이전 상태로 되돌림. 필요 시 미방문 처리 가능',
          },
        });
      } else {
        const previousEntry = current.actualEntryAt;
        current = await tx.parkingReservation.update({
          where: { reservationId: params.reservationId },
          data: { actualEntryAt: params.actualEntryAt },
          include: RESERVATION_WITH_SPACES,
        });
        await tx.parkingReservationStatusLog.create({
          data: {
            reservationId: params.reservationId,
            previousStatus: current.reservationStatus,
            currentStatus: current.reservationStatus,
            changedByType: ChangedByType.ADMIN,
            changedByAdminId: params.adminUserId,
            changeReason: `입차 시각 수정(관리자 정정): ${
              previousEntry ? formatKstDateTime(previousEntry) : '-'
            } → ${formatKstDateTime(params.actualEntryAt)}`,
          },
        });
      }
    }

    return current;
  });

  await writeAuditLog({
    actorAdminId: params.adminUserId,
    actionType: AUDIT_ACTIONS.RESERVATION_ENTRY_EXIT_RECORD_CHANGE,
    targetType: AUDIT_TARGETS.RESERVATION,
    targetId: updated.reservationId,
    detail: {
      reservationNo: updated.reservationNo,
      actualEntryAtChanged: params.actualEntryAt !== undefined,
      actualExitAtChanged: params.actualExitAt !== undefined,
    },
    context: params.requestContext,
  });

  return updated;
}

/** 미방문(NO_SHOW) 처리 */
export async function markNoShow(
  params: { reservationId: number; reason?: string } & AdminActionContext,
): Promise<ReservationWithSpaces> {
  await assertEntryExitEnabled();

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
  /** 상태 전이 자체는 허용되지만 값(예: 출차 시각)이 부적절한 경우를 막는다. */
  validate?: (current: ReservationWithSpaces) => void;
}): Promise<ReservationWithSpaces> {
  return prisma.$transaction(async (tx) => {
    const current = await loadReservationOrThrow(params.reservationId, tx);
    assertTransition(current.reservationStatus, params.nextStatus);
    params.validate?.(current);

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

/**
 * 상태 필터를 where 절로 바꾼다.
 *
 * 관리자 목록은 저장된 실제 상태만 필터로 받는다("사용 중"/"사용 완료" 파생 상태는 쓰지 않음).
 * 승인 완료를 고르면 방문 시간과 무관하게 승인 완료인 예약이 전부 나온다.
 */
function buildStatusWhere(
  status: ReservationStatus | undefined,
): Prisma.ParkingReservationWhereInput {
  if (!status) return {};
  return { reservationStatus: status };
}

export type ReservationListFilter = {
  date?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** 저장된 상태. 관리자 목록 필터는 파생 상태(IN_USE / USED)를 쓰지 않는다. */
  status?: ReservationStatus;
  requesterType?: RequesterType;
  vehicleNo?: string;
  requesterName?: string;
  spaceCode?: string;
  page?: number;
  pageSize?: number;
};

/** 관리자 목록용 표현형. 마스킹 없이 원문을 그대로 노출한다. */
export type ReservationListItem = {
  reservationId: number;
  reservationNo: string;
  requesterType: RequesterType;
  reservationStatus: ReservationStatus;
  /** 화면 표시용 상태. 승인 완료 건은 방문 시간에 따라 사용 중/사용 완료로 갈린다. */
  displayStatus: DisplayReservationStatus;
  companyOrBranchName: string;
  requesterName: string;
  requesterEmail: string;
  vehicleNo: string;
  visitStartAt: Date;
  visitEndAt: Date;
  assignedSpaceCode: string | null;
  assignedSpaceType: SpaceType | null;
  createdAt: Date;
};

/**
 * 관리자 예약 목록 조회.
 *
 * 목록에도 성명/이메일/차량번호 원문이 포함되므로, actor 가 주어지면 감사 로그를 남긴다.
 * (actor 를 선택 인자로 둔 것은 내부 통계 등 감사 대상이 아닌 호출을 허용하기 위함이다)
 */
export async function listReservationsForAdmin(
  filter: ReservationListFilter,
  actor?: AdminActionContext,
): Promise<{
  items: ReservationListItem[];
  totalCount: number;
  /** 같은 검색 조건에서 승인 대기(REQUESTED)인 건수 */
  pendingCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  // 상태 외의 조건. 미승인 건수는 상태 조건만 바꿔서 같은 범위로 센다.
  const whereWithoutStatus: Prisma.ParkingReservationWhereInput = {
    ...(filter.dateFrom && filter.dateTo
      ? { visitStartAt: { lt: filter.dateTo }, visitEndAt: { gt: filter.dateFrom } }
      : {}),
    ...(filter.requesterType ? { requesterType: filter.requesterType } : {}),
    ...(filter.vehicleNo ? { vehicleNo: { contains: normalizeVehicleNo(filter.vehicleNo) } } : {}),
    ...(filter.requesterName ? { requesterName: { contains: filter.requesterName } } : {}),
    ...(filter.spaceCode ? { assignedSpace: { spaceCode: { contains: filter.spaceCode } } } : {}),
  };

  const where: Prisma.ParkingReservationWhereInput = {
    ...whereWithoutStatus,
    ...buildStatusWhere(filter.status),
  };

  const [totalCount, pendingCount, rows, settings] = await Promise.all([
    prisma.parkingReservation.count({ where }),
    /*
     * 같은 검색 조건에서 아직 승인 대기인 건수.
     * 상태 조건만 REQUESTED 로 바꿔 세므로, 관리자가 상태 필터를 걸어 둔 상태에서도
     * "처리할 게 남아 있다" 는 사실이 보인다.
     */
    prisma.parkingReservation.count({
      where: { ...whereWithoutStatus, reservationStatus: ReservationStatus.REQUESTED },
    }),
    prisma.parkingReservation.findMany({
      where,
      include: RESERVATION_WITH_SPACES,
      // 신청일시 최신순. 같은 시각이면 나중에 만들어진 예약이 먼저 온다.
      orderBy: [{ createdAt: 'desc' }, { reservationId: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getSystemSettings(),
  ]);

  if (actor) {
    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.RESERVATION_LIST_VIEW,
      targetType: AUDIT_TARGETS.RESERVATION,
      targetId: null,
      // 검색어 원문(성명/차량번호)은 그 자체가 개인정보이므로 입력 여부만 남긴다.
      // 대신 실제로 노출된 예약 ID 를 남겨 "어떤 정보주체를 처리했는지" 추적할 수 있게 한다.
      detail: {
        page,
        resultCount: rows.length,
        totalCount,
        filters: {
          date: Boolean(filter.dateFrom),
          status: filter.status ?? null,
          requesterType: filter.requesterType ?? null,
          spaceCode: filter.spaceCode ?? null,
          vehicleNoKeyword: Boolean(filter.vehicleNo),
          requesterNameKeyword: Boolean(filter.requesterName),
        },
        reservationIds: rows.map((row) => row.reservationId),
      },
      context: actor.requestContext,
    });
  }

  return {
    items: rows.map((row) => toReservationListItem(row, settings.entryExitManagementEnabled)),
    totalCount,
    pendingCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export function toReservationListItem(
  reservation: ReservationWithSpaces,
  entryExitManagementEnabled: boolean,
): ReservationListItem {
  return {
    reservationId: reservation.reservationId,
    reservationNo: reservation.reservationNo,
    requesterType: reservation.requesterType,
    reservationStatus: reservation.reservationStatus,
    displayStatus: resolveDisplayStatus(reservation, entryExitManagementEnabled),
    companyOrBranchName: reservation.companyOrBranchName,
    requesterName: reservation.requesterName,
    requesterEmail: reservation.requesterEmail,
    vehicleNo: reservation.vehicleNo,
    visitStartAt: reservation.visitStartAt,
    visitEndAt: reservation.visitEndAt,
    assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
    assignedSpaceType: reservation.assignedSpace?.spaceType ?? null,
    createdAt: reservation.createdAt,
  };
}

/**
 * 회원 마이페이지용 내 예약 목록.
 * 로그인 회원이 신청한 예약(user_id 로 연결된 건)만 조회한다.
 */
export async function listReservationsForUser(
  userId: number,
  options: { limit?: number; entryExitManagementEnabled: boolean },
): Promise<ReservationListItem[]> {
  const rows = await prisma.parkingReservation.findMany({
    where: { userId },
    include: RESERVATION_WITH_SPACES,
    orderBy: [{ visitStartAt: 'desc' }, { reservationId: 'desc' }],
    take: Math.min(100, Math.max(1, options.limit ?? 50)),
  });

  return rows.map((row) => toReservationListItem(row, options.entryExitManagementEnabled));
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
