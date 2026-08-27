import {
  AccountStatus,
  ChangedByType,
  Prisma,
  RecurringScheduleStatus,
  RequesterType,
  ReservationStatus,
} from '@prisma/client';

import { checkOperatingHours, checkVisitRange } from '@/domain/reservation-rules';
import { assertTransition } from '@/domain/reservation-status';
import { formatKstDate, zonedInputToUtc } from '@/lib/datetime';
import {
  buildAccessUrl,
  dispatchQuietly,
  sendApprovedEmail,
  sendNewRequestToAdminEmails,
  sendRecurringOccurrenceSkippedEmail,
  sendRecurringScheduleCancelledEmail,
  sendRecurringScheduleCreatedEmail,
  sendRecurringScheduleUpdatedEmail,
  sendRequestReceivedEmail,
  type RecurringScheduleForEmail,
} from '@/lib/email/email-service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { generateReservationNo } from '@/lib/tokens';
import { normalizeVehicleNo } from '@/lib/vehicle';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import { getRequesterChangeDeadline } from '@/domain/reservation-rules';
import { issueAccessToken } from '@/services/reservation-access-service';
import {
  assertSpaceAssignable,
  lockSpaceRow,
  toReservationListItem,
  type AdminActionContext,
  type ReservationListItem,
} from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { findConflictingReservation } from '@/services/space-assignment-service';

/**
 * 반복 예약(정기 주차 배정) 서비스.
 *
 * 관리자가 특정 직원에게 특정 주차면을 기간·요일·매일 시간대로 미리 선점해 주는
 * 시리즈(`RecurringReservationSchedule`)를 만들면, 그 자리에서 기간 내 해당 요일의
 * `ParkingReservation` 을 전부 생성해 둔다(occurrence). 입·출차·승인·반려는 그 occurrence
 * 행에 대해 reservation-service.ts 의 기존 로직을 그대로 쓴다 — 이 서비스는 시리즈
 * 생성/조회/개별 날짜 제외/전체 취소만 다룬다.
 */

/** 한 시리즈가 커버할 수 있는 최대 기간(일). 무한정 쌓이는 것을 막는다. */
const MAX_SCHEDULE_DAYS = 180;

const RECURRING_OCCURRENCE_WITH_SPACES = {
  assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
  employeeUser: { select: { name: true, email: true } },
  recurringSchedule: { select: { scheduleId: true, skipEmail: true } },
} satisfies Prisma.ParkingReservationInclude;

type RecurringOccurrence = Prisma.ParkingReservationGetPayload<{
  include: typeof RECURRING_OCCURRENCE_WITH_SPACES;
}>;

function parseDateOnly(input: string, fieldName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    throw new ValidationError('날짜 형식이 올바르지 않습니다. (예: 2026-08-20)', {
      [fieldName]: ['날짜 형식이 올바르지 않습니다. (예: 2026-08-20)'],
    });
  }
  const [y, m, d] = input.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** DB 에 저장된 날짜 전용(@db.Date) 컬럼 표시용. 시각·타임존 변환이 필요 없는 순수 달력 날짜다. */
function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** JS Date.getDay() 비트마스크(bit0=일 ... bit6=토) 기준 요일 라벨 목록 */
function toWeekdaysLabel(mask: number): string {
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels.filter((_, index) => (mask >> index) & 1).join(', ');
}

/** [startDate, endDate] 구간에서 weekdaysMask 에 해당하는 날짜('yyyy-MM-dd') 전부 */
function enumerateOccurrenceDates(start: Date, end: Date, weekdaysMask: number): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime();) {
    if ((weekdaysMask >> cursor.getUTCDay()) & 1) {
      dates.push(formatDateOnly(cursor));
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

type ScheduleWithEmployeeAndSpace = {
  requesterEmail: string;
  startDate: Date;
  endDate: Date;
  weekdaysMask: number;
  dailyStartTime: string;
  dailyEndTime: string;
  employeeUser: { name: string; departmentName: string };
  assignedSpace: { spaceCode: string };
};

function toScheduleForEmail(schedule: ScheduleWithEmployeeAndSpace): RecurringScheduleForEmail {
  return {
    requesterEmail: schedule.requesterEmail,
    employeeName: schedule.employeeUser.name,
    departmentName: schedule.employeeUser.departmentName,
    spaceCode: schedule.assignedSpace.spaceCode,
    startDate: formatDateOnly(schedule.startDate),
    endDate: formatDateOnly(schedule.endDate),
    weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
    dailyStartTime: schedule.dailyStartTime,
    dailyEndTime: schedule.dailyEndTime,
  };
}

type SchedulePatternInput = {
  startDate: string;
  endDate?: string | null;
  weekdaysMask: number;
  dailyStartTime: string;
  dailyEndTime: string;
};

/**
 * 반복 패턴(기간·요일·매일 시간대) 공통 검증. 등록/수정 양쪽에서 재사용한다.
 * 매일 반복되는 시간대 자체가 운영시간·최대 이용시간 규칙을 지키는지는 대표로 한 번만
 * 검증한다(모든 occurrence 가 같은 시간대를 쓰므로 개별 검증은 불필요하다).
 */
async function validateSchedulePattern(
  input: SchedulePatternInput,
): Promise<{ startDate: Date; endDate: Date }> {
  const startDate = parseDateOnly(input.startDate, 'startDate');
  // 종료일을 비우면 "기간 제한 없음"으로 취급하되, 전체 생성은 최대 허용 기간(6개월)까지만 채운다.
  const endDate = input.endDate
    ? parseDateOnly(input.endDate, 'endDate')
    : new Date(startDate.getTime() + (MAX_SCHEDULE_DAYS - 1) * 86_400_000);

  if (endDate.getTime() < startDate.getTime()) {
    throw new ValidationError('종료일은 시작일 이후여야 합니다.', {
      endDate: ['종료일은 시작일 이후여야 합니다.'],
    });
  }
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (totalDays > MAX_SCHEDULE_DAYS) {
    throw new ValidationError(`반복 기간은 최대 ${MAX_SCHEDULE_DAYS}일까지 등록할 수 있습니다.`, {
      endDate: [`반복 기간은 최대 ${MAX_SCHEDULE_DAYS}일까지 등록할 수 있습니다.`],
    });
  }
  if (input.weekdaysMask <= 0 || input.weekdaysMask > 0b1111111) {
    throw new ValidationError('반복할 요일을 하나 이상 선택해 주세요.', {
      weekdaysMask: ['반복할 요일을 하나 이상 선택해 주세요.'],
    });
  }

  const settings = await getSystemSettings();
  const sampleStart = zonedInputToUtc(
    `${input.startDate}T${input.dailyStartTime}`,
    settings.appTimeZone,
  );
  const sampleEnd = zonedInputToUtc(
    `${input.startDate}T${input.dailyEndTime}`,
    settings.appTimeZone,
  );
  const rangeError = checkVisitRange(sampleStart, sampleEnd, settings.maxReservationHours);
  if (rangeError) throw new ValidationError(rangeError, { dailyEndTime: [rangeError] });
  const hoursError = checkOperatingHours(
    sampleStart,
    sampleEnd,
    settings.parkingOpenTime,
    settings.parkingCloseTime,
    settings.appTimeZone,
  );
  if (hoursError) throw new ValidationError(hoursError, { dailyStartTime: [hoursError] });

  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// 1. 시리즈 생성
// ---------------------------------------------------------------------------

export type CreateRecurringScheduleInput = {
  employeeUserId: number;
  spaceId: number;
  requesterName: string;
  requesterEmail: string;
  companyOrBranchName?: string | null;
  vehicleNo: string;
  /** 'yyyy-MM-dd' */
  startDate: string;
  /** 비우면 시작일 기준 최대 허용 기간(6개월, {@link MAX_SCHEDULE_DAYS})으로 자동 채운다. */
  endDate?: string | null;
  /** bit0=일 ... bit6=토 */
  weekdaysMask: number;
  /** 'HH:mm' */
  dailyStartTime: string;
  dailyEndTime: string;
  skipApproval: boolean;
  skipEmail: boolean;
};

export type CreateRecurringScheduleResult = {
  scheduleId: number;
  createdCount: number;
  /** 이미 그 주차면이 쓰이고 있어 건너뛴 날짜('yyyy-MM-dd') 목록 */
  skippedDates: string[];
};

export async function createRecurringSchedule(
  input: CreateRecurringScheduleInput,
  actor: AdminActionContext,
): Promise<CreateRecurringScheduleResult> {
  const { startDate, endDate } = await validateSchedulePattern(input);
  const settings = await getSystemSettings();

  const employee = await prisma.employeeUser.findFirst({
    where: {
      employeeUserId: input.employeeUserId,
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
    },
    select: { employeeUserId: true, name: true, departmentName: true },
  });
  if (!employee) {
    throw new ValidationError('대상 직원을 찾을 수 없습니다.', {
      employeeUserId: ['대상 직원을 찾을 수 없습니다.'],
    });
  }

  const vehicleNo = normalizeVehicleNo(input.vehicleNo);
  const companyOrBranchName = input.companyOrBranchName?.trim() || null;

  const schedule = await prisma.$transaction(async (tx) => {
    await lockSpaceRow(tx, input.spaceId);
    await assertSpaceAssignable(tx, input.spaceId, settings.doubleParkingEnabled);

    return tx.recurringReservationSchedule.create({
      data: {
        employeeUserId: input.employeeUserId,
        assignedSpaceId: input.spaceId,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        companyOrBranchName,
        vehicleNo,
        startDate,
        endDate,
        weekdaysMask: input.weekdaysMask,
        dailyStartTime: input.dailyStartTime,
        dailyEndTime: input.dailyEndTime,
        skipApproval: input.skipApproval,
        skipEmail: input.skipEmail,
        createdByAdminId: actor.adminUserId,
      },
      include: {
        employeeUser: { select: { name: true, departmentName: true } },
        assignedSpace: { select: { spaceCode: true } },
      },
    });
  });

  const occurrenceDates = enumerateOccurrenceDates(startDate, endDate, input.weekdaysMask);
  const skippedDates: string[] = [];
  let createdCount = 0;

  for (const dateStr of occurrenceDates) {
    const visitStartAt = zonedInputToUtc(
      `${dateStr}T${input.dailyStartTime}`,
      settings.appTimeZone,
    );
    const visitEndAt = zonedInputToUtc(`${dateStr}T${input.dailyEndTime}`, settings.appTimeZone);

    const created = await createOccurrence({
      scheduleId: schedule.scheduleId,
      spaceId: input.spaceId,
      employeeUserId: input.employeeUserId,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      companyOrBranchName,
      vehicleNo,
      visitStartAt,
      visitEndAt,
      skipApproval: input.skipApproval,
      doubleParkingEnabled: settings.doubleParkingEnabled,
      actor,
    });

    if (!created) {
      skippedDates.push(dateStr);
      continue;
    }
    createdCount += 1;

    if (!input.skipEmail) {
      await dispatchOccurrenceCreatedEmail(created, settings.reservationMinLeadMinutes);
    }
  }

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_SCHEDULE_CREATE,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: schedule.scheduleId,
    detail: {
      employeeUserId: input.employeeUserId,
      spaceCode: schedule.assignedSpace.spaceCode,
      createdCount,
      skippedCount: skippedDates.length,
    },
    context: actor.requestContext,
  });

  await dispatchQuietly(
    sendRecurringScheduleCreatedEmail(toScheduleForEmail(schedule), { createdCount, skippedDates }),
  );

  return { scheduleId: schedule.scheduleId, createdCount, skippedDates };
}

/** occurrence 하나를 트랜잭션 안에서 생성한다. 그 시간대에 이미 자리가 차 있으면 null. */
async function createOccurrence(params: {
  scheduleId: number;
  spaceId: number;
  employeeUserId: number;
  requesterName: string;
  requesterEmail: string;
  companyOrBranchName: string | null;
  vehicleNo: string;
  visitStartAt: Date;
  visitEndAt: Date;
  skipApproval: boolean;
  doubleParkingEnabled: boolean;
  actor: AdminActionContext;
}) {
  const now = new Date();
  const isApproved = params.skipApproval;

  try {
    return await prisma.$transaction(async (tx) => {
      await lockSpaceRow(tx, params.spaceId);
      await assertSpaceAssignable(tx, params.spaceId, params.doubleParkingEnabled);
      const conflict = await findConflictingReservation(
        {
          spaceId: params.spaceId,
          visitStartAt: params.visitStartAt,
          visitEndAt: params.visitEndAt,
        },
        tx,
      );
      if (conflict) {
        throw new ConflictError(
          '해당 시간대에 이미 그 주차면이 사용 중입니다.',
          'SPACE_TIME_CONFLICT',
        );
      }

      const reservationNo = generateReservationNo(formatKstDate(params.visitStartAt));

      const created = await tx.parkingReservation.create({
        data: {
          reservationNo,
          requesterType: RequesterType.EMPLOYEE,
          employeeUserId: params.employeeUserId,
          visitorUserId: null,
          companyOrBranchName: params.companyOrBranchName ?? '',
          requesterName: params.requesterName,
          requesterEmail: params.requesterEmail,
          vehicleNo: params.vehicleNo,
          visitStartAt: params.visitStartAt,
          visitEndAt: params.visitEndAt,
          assignedSpaceId: params.spaceId,
          reservationStatus: isApproved ? ReservationStatus.APPROVED : ReservationStatus.REQUESTED,
          approvalAdminId: isApproved ? params.actor.adminUserId : null,
          approvedAt: isApproved ? now : null,
          privacyConsentAt: now,
          recurringScheduleId: params.scheduleId,
        },
        include: RECURRING_OCCURRENCE_WITH_SPACES,
      });

      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: created.reservationId,
          previousStatus: null,
          currentStatus: created.reservationStatus,
          changedByType: ChangedByType.ADMIN,
          changedByAdminId: params.actor.adminUserId,
          changeReason: '반복 예약 등록',
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof ConflictError) return null;
    throw error;
  }
}

async function dispatchOccurrenceCreatedEmail(
  occurrence: RecurringOccurrence,
  reservationMinLeadMinutes: number,
): Promise<void> {
  const forEmail = {
    reservationId: occurrence.reservationId,
    reservationNo: occurrence.reservationNo,
    requesterType: occurrence.requesterType,
    requesterName: occurrence.requesterName,
    requesterEmail: occurrence.requesterEmail,
    companyOrBranchName: occurrence.companyOrBranchName,
    vehicleNo: occurrence.vehicleNo,
    visitStartAt: occurrence.visitStartAt,
    visitEndAt: occurrence.visitEndAt,
    assignedSpace: occurrence.assignedSpace,
    hostEmployee: occurrence.employeeUser,
  };

  const { rawToken } = await issueAccessToken({
    reservationId: occurrence.reservationId,
    visitEndAt: occurrence.visitEndAt,
  });
  const accessUrl = buildAccessUrl(rawToken);

  await dispatchQuietly(
    occurrence.reservationStatus === ReservationStatus.APPROVED
      ? sendApprovedEmail(forEmail, { accessUrl })
      : Promise.all([
          sendRequestReceivedEmail(forEmail, {
            accessUrl,
            changeDeadlineAt: getRequesterChangeDeadline(
              occurrence.visitStartAt,
              reservationMinLeadMinutes,
            ),
          }),
          sendNewRequestToAdminEmails(forEmail),
        ]),
  );
}

// ---------------------------------------------------------------------------
// 2. 조회
// ---------------------------------------------------------------------------

export type RecurringScheduleListItem = {
  scheduleId: number;
  employeeUserId: number;
  employeeName: string;
  departmentName: string;
  spaceCode: string;
  startDate: string;
  endDate: string;
  /** bit0=일 ... bit6=토. 수정 폼에서 요일 체크박스를 미리 채우는 데 쓴다. */
  weekdaysMask: number;
  weekdaysLabel: string;
  dailyStartTime: string;
  dailyEndTime: string;
  skipApproval: boolean;
  skipEmail: boolean;
  status: RecurringScheduleStatus;
  createdAt: Date;
  occurrenceCount: number;
  activeOccurrenceCount: number;
};

const ACTIVE_OCCURRENCE_STATUSES: ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
  ReservationStatus.PARKING,
];

export async function listRecurringSchedules(): Promise<RecurringScheduleListItem[]> {
  const schedules = await prisma.recurringReservationSchedule.findMany({
    orderBy: [{ scheduleId: 'desc' }],
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
      occurrences: { select: { reservationStatus: true } },
    },
  });

  return schedules.map((schedule) => ({
    scheduleId: schedule.scheduleId,
    employeeUserId: schedule.employeeUserId,
    employeeName: schedule.employeeUser.name,
    departmentName: schedule.employeeUser.departmentName,
    spaceCode: schedule.assignedSpace.spaceCode,
    startDate: formatDateOnly(schedule.startDate),
    endDate: formatDateOnly(schedule.endDate),
    weekdaysMask: schedule.weekdaysMask,
    weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
    dailyStartTime: schedule.dailyStartTime,
    dailyEndTime: schedule.dailyEndTime,
    skipApproval: schedule.skipApproval,
    skipEmail: schedule.skipEmail,
    status: schedule.status,
    createdAt: schedule.createdAt,
    occurrenceCount: schedule.occurrences.length,
    activeOccurrenceCount: schedule.occurrences.filter((occurrence) =>
      ACTIVE_OCCURRENCE_STATUSES.includes(occurrence.reservationStatus),
    ).length,
  }));
}

export async function getRecurringScheduleDetail(scheduleId: number): Promise<{
  schedule: RecurringScheduleListItem;
  occurrences: ReservationListItem[];
}> {
  const schedule = await prisma.recurringReservationSchedule.findUnique({
    where: { scheduleId },
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
      occurrences: { select: { reservationStatus: true } },
    },
  });
  if (!schedule) throw new NotFoundError('반복 예약 일정을 찾을 수 없습니다.');

  const settings = await getSystemSettings();
  const occurrenceRows = await prisma.parkingReservation.findMany({
    where: { recurringScheduleId: scheduleId },
    include: RECURRING_OCCURRENCE_WITH_SPACES,
    orderBy: [{ visitStartAt: 'asc' }],
  });

  return {
    schedule: {
      scheduleId: schedule.scheduleId,
      employeeUserId: schedule.employeeUserId,
      employeeName: schedule.employeeUser.name,
      departmentName: schedule.employeeUser.departmentName,
      spaceCode: schedule.assignedSpace.spaceCode,
      startDate: formatDateOnly(schedule.startDate),
      endDate: formatDateOnly(schedule.endDate),
      weekdaysMask: schedule.weekdaysMask,
      weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
      dailyStartTime: schedule.dailyStartTime,
      dailyEndTime: schedule.dailyEndTime,
      skipApproval: schedule.skipApproval,
      skipEmail: schedule.skipEmail,
      status: schedule.status,
      createdAt: schedule.createdAt,
      occurrenceCount: schedule.occurrences.length,
      activeOccurrenceCount: schedule.occurrences.filter((occurrence) =>
        ACTIVE_OCCURRENCE_STATUSES.includes(occurrence.reservationStatus),
      ).length,
    },
    occurrences: occurrenceRows.map((row) =>
      toReservationListItem(row, settings.entryExitManagementEnabled),
    ),
  };
}

// ---------------------------------------------------------------------------
// 3. 개별 날짜 제외 (연차 등)
// ---------------------------------------------------------------------------

/**
 * 반복 예약 시리즈 중 특정 날짜(occurrence) 하나만 취소한다 — 시리즈 자체는 유지된다.
 * 관리자가 반복 일정을 관리하는 행위이므로, 신청자 셀프 취소의 "마감 시각 이전에만" 같은
 * 제약은 적용하지 않는다.
 */
export async function skipRecurringOccurrence(
  reservationId: number,
  reason: string,
  actor: AdminActionContext,
): Promise<void> {
  const reservation = await prisma.parkingReservation.findUnique({
    where: { reservationId },
    include: {
      recurringSchedule: {
        include: {
          employeeUser: { select: { name: true, departmentName: true } },
          assignedSpace: { select: { spaceCode: true } },
        },
      },
    },
  });
  if (!reservation || !reservation.recurringSchedule) {
    throw new NotFoundError('반복 예약 occurrence 를 찾을 수 없습니다.');
  }

  assertTransition(reservation.reservationStatus, ReservationStatus.CANCELLED);

  await prisma.$transaction(async (tx) => {
    await tx.parkingReservation.update({
      where: { reservationId },
      data: {
        reservationStatus: ReservationStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
        assignedSpaceId: null,
      },
    });
    await tx.parkingReservationStatusLog.create({
      data: {
        reservationId,
        previousStatus: reservation.reservationStatus,
        currentStatus: ReservationStatus.CANCELLED,
        changedByType: ChangedByType.ADMIN,
        changedByAdminId: actor.adminUserId,
        changeReason: reason,
      },
    });
  });

  const skipDate = formatKstDate(reservation.visitStartAt);

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_OCCURRENCE_SKIP,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: reservation.recurringSchedule.scheduleId,
    detail: { reservationId, skipDate, reason },
    context: actor.requestContext,
  });

  await dispatchQuietly(
    sendRecurringOccurrenceSkippedEmail(toScheduleForEmail(reservation.recurringSchedule), {
      skipDate,
      reason,
    }),
  );
}

/** 예약 여러 건을 한꺼번에 취소 처리한다(반복 일정 수정/삭제 시 재사용). */
async function cancelOccurrences(
  occurrences: { reservationId: number; reservationStatus: ReservationStatus }[],
  reason: string,
  actor: AdminActionContext,
): Promise<number> {
  const now = new Date();
  for (const occurrence of occurrences) {
    assertTransition(occurrence.reservationStatus, ReservationStatus.CANCELLED);
    await prisma.$transaction(async (tx) => {
      await tx.parkingReservation.update({
        where: { reservationId: occurrence.reservationId },
        data: {
          reservationStatus: ReservationStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: reason,
          assignedSpaceId: null,
        },
      });
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: occurrence.reservationId,
          previousStatus: occurrence.reservationStatus,
          currentStatus: ReservationStatus.CANCELLED,
          changedByType: ChangedByType.ADMIN,
          changedByAdminId: actor.adminUserId,
          changeReason: reason,
        },
      });
    });
  }
  return occurrences.length;
}

// ---------------------------------------------------------------------------
// 4. 시리즈 수정 (요일·시간·기간)
// ---------------------------------------------------------------------------

export type UpdateRecurringScheduleInput = {
  /** 'yyyy-MM-dd' */
  startDate: string;
  /** 비우면 시작일 기준 최대 허용 기간(6개월)으로 자동 채운다. */
  endDate?: string | null;
  /** bit0=일 ... bit6=토 */
  weekdaysMask: number;
  /** 'HH:mm' */
  dailyStartTime: string;
  dailyEndTime: string;
  skipApproval: boolean;
  skipEmail: boolean;
};

export type UpdateRecurringScheduleResult = {
  /** 새 일정과 무관하게 미리 정리된 기존 예정 방문 건수 */
  cancelledCount: number;
  createdCount: number;
  skippedDates: string[];
};

/**
 * 반복 일정(요일·시간·기간) 자체를 수정한다. 대상 직원·주차면은 바꿀 수 없다
 * (바꾸려면 삭제 후 재등록). 이미 지난/진행 중인 occurrence 는 건드리지 않고,
 * 아직 방문 전인 미래 occurrence 는 전부 정리한 뒤 새 패턴으로 다시 만든다 —
 * 날짜별로 바뀐 부분만 골라내는 것보다 훨씬 단순하고 결과는 동일하다.
 */
export async function updateRecurringSchedule(
  scheduleId: number,
  input: UpdateRecurringScheduleInput,
  actor: AdminActionContext,
): Promise<UpdateRecurringScheduleResult> {
  const schedule = await prisma.recurringReservationSchedule.findUnique({
    where: { scheduleId },
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
    },
  });
  if (!schedule) throw new NotFoundError('반복 예약 일정을 찾을 수 없습니다.');
  if (schedule.status !== RecurringScheduleStatus.ACTIVE) {
    throw new ValidationError('이미 삭제된 반복 예약은 수정할 수 없습니다.');
  }

  const employeeStillActive = await prisma.employeeUser.findFirst({
    where: {
      employeeUserId: schedule.employeeUserId,
      deletedAt: null,
      accountStatus: AccountStatus.ACTIVE,
    },
    select: { employeeUserId: true },
  });
  if (!employeeStillActive) {
    throw new ValidationError(
      '대상 직원 계정이 비활성화되어 반복 일정을 수정할 수 없습니다. 삭제해 주세요.',
    );
  }

  const { startDate, endDate } = await validateSchedulePattern(input);
  const settings = await getSystemSettings();
  const now = new Date();

  const futureOccurrences = await prisma.parkingReservation.findMany({
    where: {
      recurringScheduleId: scheduleId,
      reservationStatus: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
      visitStartAt: { gt: now },
    },
    select: { reservationId: true, reservationStatus: true },
  });
  const cancelledCount = await cancelOccurrences(futureOccurrences, '반복 일정 수정', actor);

  await prisma.recurringReservationSchedule.update({
    where: { scheduleId },
    data: {
      startDate,
      endDate,
      weekdaysMask: input.weekdaysMask,
      dailyStartTime: input.dailyStartTime,
      dailyEndTime: input.dailyEndTime,
      skipApproval: input.skipApproval,
      skipEmail: input.skipEmail,
    },
  });

  // 오늘 이전 날짜는 다시 만들지 않는다 — 이미 지난 구간은 새 패턴으로 되돌릴 수 없다.
  const today = parseDateOnly(formatKstDate(now, settings.appTimeZone), 'startDate');
  const regenFrom = today.getTime() > startDate.getTime() ? today : startDate;

  const occurrenceDates = enumerateOccurrenceDates(regenFrom, endDate, input.weekdaysMask);
  const skippedDates: string[] = [];
  let createdCount = 0;

  for (const dateStr of occurrenceDates) {
    const visitStartAt = zonedInputToUtc(
      `${dateStr}T${input.dailyStartTime}`,
      settings.appTimeZone,
    );
    const visitEndAt = zonedInputToUtc(`${dateStr}T${input.dailyEndTime}`, settings.appTimeZone);

    const created = await createOccurrence({
      scheduleId,
      spaceId: schedule.assignedSpaceId,
      employeeUserId: schedule.employeeUserId,
      requesterName: schedule.requesterName,
      requesterEmail: schedule.requesterEmail,
      companyOrBranchName: schedule.companyOrBranchName,
      vehicleNo: schedule.vehicleNo,
      visitStartAt,
      visitEndAt,
      skipApproval: input.skipApproval,
      doubleParkingEnabled: settings.doubleParkingEnabled,
      actor,
    });

    if (!created) {
      skippedDates.push(dateStr);
      continue;
    }
    createdCount += 1;

    if (!input.skipEmail) {
      await dispatchOccurrenceCreatedEmail(created, settings.reservationMinLeadMinutes);
    }
  }

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_SCHEDULE_UPDATE,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: scheduleId,
    detail: { cancelledCount, createdCount, skippedCount: skippedDates.length },
    context: actor.requestContext,
  });

  await dispatchQuietly(
    sendRecurringScheduleUpdatedEmail(
      toScheduleForEmail({
        ...schedule,
        startDate,
        endDate,
        weekdaysMask: input.weekdaysMask,
        dailyStartTime: input.dailyStartTime,
        dailyEndTime: input.dailyEndTime,
      }),
      { cancelledCount, createdCount, skippedDates },
    ),
  );

  return { cancelledCount, createdCount, skippedDates };
}

// ---------------------------------------------------------------------------
// 5. 시리즈 삭제
// ---------------------------------------------------------------------------

/**
 * 반복 일정 자체를 완전히 삭제한다(단순 취소가 아니라 목록에서 사라진다).
 * 아직 방문 전인 occurrence 는 전부 취소하고, 이미 지난 occurrence(실제 방문 기록)는
 * 그대로 남되 시리즈 연결만 끊어진다(스키마의 onDelete: SetNull).
 */
export async function deleteRecurringSchedule(
  scheduleId: number,
  actor: AdminActionContext,
): Promise<{ cancelledCount: number }> {
  const schedule = await prisma.recurringReservationSchedule.findUnique({
    where: { scheduleId },
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
    },
  });
  if (!schedule) throw new NotFoundError('반복 예약 일정을 찾을 수 없습니다.');

  const activeOccurrences = await prisma.parkingReservation.findMany({
    where: {
      recurringScheduleId: scheduleId,
      reservationStatus: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
    },
    select: { reservationId: true, reservationStatus: true },
  });
  const cancelledCount = await cancelOccurrences(activeOccurrences, '반복 예약 삭제', actor);

  await prisma.recurringReservationSchedule.delete({ where: { scheduleId } });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_SCHEDULE_DELETE,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: scheduleId,
    detail: { cancelledCount },
    context: actor.requestContext,
  });

  await dispatchQuietly(sendRecurringScheduleCancelledEmail(toScheduleForEmail(schedule)));

  return { cancelledCount };
}
