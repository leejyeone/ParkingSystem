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
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { generateReservationNo } from '@/lib/tokens';
import { normalizeVehicleNo } from '@/lib/vehicle';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
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

/** 한 시리즈가 커버할 수 있는 최대 기간(일) = 1개월. 종료일은 항상 이 안에 들어야 한다. */
const MAX_SCHEDULE_DAYS = 31;

const RECURRING_OCCURRENCE_WITH_SPACES = {
  assignedSpace: { select: { spaceId: true, spaceCode: true, spaceType: true } },
  employeeUser: { select: { name: true, email: true } },
  recurringSchedule: { select: { scheduleId: true } },
} satisfies Prisma.ParkingReservationInclude;

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

type SchedulePatternInput = {
  startDate: string;
  endDate: string;
  weekdaysMask: number;
  dailyStartTime: string;
  dailyEndTime: string;
};

/**
 * 반복 패턴(기간·요일·매일 시간대) 공통 검증. 등록/수정 양쪽에서 재사용한다.
 * 매일 반복되는 시간대 자체가 운영시간·최대 이용시간 규칙을 지키는지는 대표로 한 번만
 * 검증한다(모든 occurrence 가 같은 시간대를 쓰므로 개별 검증은 불필요하다).
 *
 * 종료일은 항상 입력해야 하며, 시작일로부터 {@link MAX_SCHEDULE_DAYS}일(1개월) 이내여야 한다.
 */
async function validateSchedulePattern(
  input: SchedulePatternInput,
): Promise<{ startDate: Date; endDate: Date }> {
  const startDate = parseDateOnly(input.startDate, 'startDate');
  const endDate = parseDateOnly(input.endDate, 'endDate');

  if (endDate.getTime() < startDate.getTime()) {
    throw new ValidationError('종료일은 시작일 이후여야 합니다.', {
      endDate: ['종료일은 시작일 이후여야 합니다.'],
    });
  }
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (totalDays > MAX_SCHEDULE_DAYS) {
    throw new ValidationError(`반복 기간은 최대 ${MAX_SCHEDULE_DAYS}일(1개월)까지 등록할 수 있습니다.`, {
      endDate: [`반복 기간은 최대 ${MAX_SCHEDULE_DAYS}일(1개월)까지 등록할 수 있습니다.`],
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
  /**
   * 시작일로부터 최대 {@link MAX_SCHEDULE_DAYS}일(1개월) 이내여야 한다.
   */
  endDate: string;
  /** bit0=일 ... bit6=토 */
  weekdaysMask: number;
  /** 'HH:mm' */
  dailyStartTime: string;
  dailyEndTime: string;
  approvalEnabled: boolean;
  /** true 면 이 시리즈의 occurrence 는 예정 시각에 자동으로 입·출차 처리된다. */
  autoEntryExitEnabled: boolean;
  /** true(기본값) 면 이 시리즈의 occurrence 는 관리자 "전체 예약" 목록에 나타나지 않는다. */
  hiddenFromReservationList: boolean;
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
        approvalEnabled: input.approvalEnabled,
        autoEntryExitEnabled: input.autoEntryExitEnabled,
        hiddenFromReservationList: input.hiddenFromReservationList,
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
      approvalEnabled: input.approvalEnabled,
      doubleParkingEnabled: settings.doubleParkingEnabled,
      bufferMinutes: settings.spaceBufferMinutes,
      actor,
    });

    if (!created) {
      skippedDates.push(dateStr);
      continue;
    }
    createdCount += 1;
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
  approvalEnabled: boolean;
  doubleParkingEnabled: boolean;
  /** 같은 주차면 예약 사이 최소 간격(분). 생략 시 0(끔). */
  bufferMinutes?: number;
  actor: AdminActionContext;
}) {
  const now = new Date();
  const isApproved = !params.approvalEnabled;

  try {
    return await prisma.$transaction(async (tx) => {
      await lockSpaceRow(tx, params.spaceId);
      await assertSpaceAssignable(tx, params.spaceId, params.doubleParkingEnabled);
      const conflict = await findConflictingReservation(
        {
          spaceId: params.spaceId,
          visitStartAt: params.visitStartAt,
          visitEndAt: params.visitEndAt,
          bufferMinutes: params.bufferMinutes,
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

      // 반복 예약 occurrence 임을 알아챌 수 있는 문구를 쓰지 않는다 — 일반 승인/등록
      // 흐름과 같은 표현을 써서, 이 예약의 상세를 열어본 관리자가 "반복"이라는 단어로
      // 그 존재를 알아채지 못하게 한다(전체 예약 목록 자체는 숨겨도, 대시보드 주차면
      // 현황에서 클릭해 상세로 들어오는 경로까지 막지는 않기 때문).
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: created.reservationId,
          previousStatus: null,
          currentStatus: created.reservationStatus,
          changedByType: ChangedByType.ADMIN,
          changedByAdminId: params.actor.adminUserId,
          changeReason: isApproved
            ? `주차면 ${created.assignedSpace?.spaceCode ?? '-'} 배정 후 승인`
            : '방문 예약 등록',
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof ConflictError) return null;
    throw error;
  }
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
  /** null 이면 이 규칙 변경 이전에 만들어진 무기한 반복이다(새 시리즈는 항상 값이 있다). */
  endDate: string | null;
  /** bit0=일 ... bit6=토. 수정 폼에서 요일 체크박스를 미리 채우는 데 쓴다. */
  weekdaysMask: number;
  weekdaysLabel: string;
  dailyStartTime: string;
  dailyEndTime: string;
  approvalEnabled: boolean;
  autoEntryExitEnabled: boolean;
  /** true(기본값) 면 이 시리즈의 occurrence 는 관리자 "전체 예약" 목록에 나타나지 않는다. */
  hiddenFromReservationList: boolean;
  status: RecurringScheduleStatus;
  createdAt: Date;
};

/** 관리자용 "반복 예약 관리" 목록 — 소프트 삭제(status=CANCELLED)된 시리즈는 제외한다. */
export async function listRecurringSchedules(): Promise<RecurringScheduleListItem[]> {
  const schedules = await prisma.recurringReservationSchedule.findMany({
    where: { status: RecurringScheduleStatus.ACTIVE },
    orderBy: [{ scheduleId: 'desc' }],
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
    },
  });

  return schedules.map((schedule) => ({
    scheduleId: schedule.scheduleId,
    employeeUserId: schedule.employeeUserId,
    employeeName: schedule.employeeUser.name,
    departmentName: schedule.employeeUser.departmentName,
    spaceCode: schedule.assignedSpace.spaceCode,
    startDate: formatDateOnly(schedule.startDate),
    endDate: schedule.endDate ? formatDateOnly(schedule.endDate) : null,
    weekdaysMask: schedule.weekdaysMask,
    weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
    dailyStartTime: schedule.dailyStartTime,
    dailyEndTime: schedule.dailyEndTime,
    approvalEnabled: schedule.approvalEnabled,
    autoEntryExitEnabled: schedule.autoEntryExitEnabled,
    hiddenFromReservationList: schedule.hiddenFromReservationList,
    status: schedule.status,
    createdAt: schedule.createdAt,
  }));
}

/**
 * 직원 마이페이지 "반복 예약" 탭용 — 해당 직원 앞으로 등록된 반복 예약 시리즈 목록.
 * occurrence 를 매번 나열하면 목록이 뒤덮이므로, 관리자 목록 화면과 같은 방식으로
 * 시리즈당 한 줄(주차면·기간·요일·시간대·상태) 요약만 보여준다.
 *
 * 관리자가 삭제(소프트 삭제, status=CANCELLED)한 시리즈는 제외한다 — 신청자는
 * 애초에 그런 시리즈의 존재를 몰랐으므로 취소된 뒤에 새삼 보여줄 필요가 없다.
 * (관리자용 listRecurringSchedules 도 동일하게 제외한다.)
 */
export async function listRecurringSchedulesForEmployee(
  employeeUserId: number,
): Promise<RecurringScheduleListItem[]> {
  const schedules = await prisma.recurringReservationSchedule.findMany({
    where: { employeeUserId, status: RecurringScheduleStatus.ACTIVE },
    orderBy: [{ scheduleId: 'desc' }],
    include: {
      employeeUser: { select: { name: true, departmentName: true } },
      assignedSpace: { select: { spaceCode: true } },
    },
  });

  return schedules.map((schedule) => ({
    scheduleId: schedule.scheduleId,
    employeeUserId: schedule.employeeUserId,
    employeeName: schedule.employeeUser.name,
    departmentName: schedule.employeeUser.departmentName,
    spaceCode: schedule.assignedSpace.spaceCode,
    startDate: formatDateOnly(schedule.startDate),
    endDate: schedule.endDate ? formatDateOnly(schedule.endDate) : null,
    weekdaysMask: schedule.weekdaysMask,
    weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
    dailyStartTime: schedule.dailyStartTime,
    dailyEndTime: schedule.dailyEndTime,
    approvalEnabled: schedule.approvalEnabled,
    autoEntryExitEnabled: schedule.autoEntryExitEnabled,
    hiddenFromReservationList: schedule.hiddenFromReservationList,
    status: schedule.status,
    createdAt: schedule.createdAt,
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
      endDate: schedule.endDate ? formatDateOnly(schedule.endDate) : null,
      weekdaysMask: schedule.weekdaysMask,
      weekdaysLabel: toWeekdaysLabel(schedule.weekdaysMask),
      dailyStartTime: schedule.dailyStartTime,
      dailyEndTime: schedule.dailyEndTime,
      approvalEnabled: schedule.approvalEnabled,
        autoEntryExitEnabled: schedule.autoEntryExitEnabled,
      hiddenFromReservationList: schedule.hiddenFromReservationList,
      status: schedule.status,
      createdAt: schedule.createdAt,
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
      recurringSchedule: { select: { scheduleId: true } },
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

/**
 * 반복 일정 수정으로 매일 시작/종료 시간이 바뀌었을 때, 날짜는 새 패턴에도 그대로
 * 남는 기존 occurrence 의 방문 시간만 그 자리에서 바꾼다(취소 후 재생성하지 않는다).
 * 취소·재생성 방식은 신청자가 존재도 몰랐던 예약이 취소된 기록만 잔뜩 남기므로
 * 피한다 — 일반 예약을 관리자가 직접 수정할 때와 같은 방식(시간만 갱신 + 이력 한 줄)이다.
 *
 * 새 시간대에 그 주차면이 이미 다른 예약으로 차 있으면(주차면은 그대로이므로 이론상
 * 드물지만 가능) 옮길 수 없으므로 false 를 반환한다 — 호출부가 그 occurrence 를
 * 취소 대상으로 넘긴다.
 */
async function tryUpdateOccurrenceTime(params: {
  reservationId: number;
  spaceId: number;
  visitStartAt: Date;
  visitEndAt: Date;
  /** 같은 주차면 예약 사이 최소 간격(분). 생략 시 0(끔). */
  bufferMinutes?: number;
  actor: AdminActionContext;
}): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockSpaceRow(tx, params.spaceId);
      const conflict = await findConflictingReservation(
        {
          spaceId: params.spaceId,
          visitStartAt: params.visitStartAt,
          visitEndAt: params.visitEndAt,
          excludeReservationId: params.reservationId,
          bufferMinutes: params.bufferMinutes,
        },
        tx,
      );
      if (conflict) {
        throw new ConflictError(
          '해당 시간대에 이미 그 주차면이 사용 중입니다.',
          'SPACE_TIME_CONFLICT',
        );
      }

      const current = await tx.parkingReservation.findUniqueOrThrow({
        where: { reservationId: params.reservationId },
        select: { reservationStatus: true },
      });

      await tx.parkingReservation.update({
        where: { reservationId: params.reservationId },
        data: { visitStartAt: params.visitStartAt, visitEndAt: params.visitEndAt },
      });
      await tx.parkingReservationStatusLog.create({
        data: {
          reservationId: params.reservationId,
          previousStatus: current.reservationStatus,
          currentStatus: current.reservationStatus,
          changedByType: ChangedByType.ADMIN,
          changedByAdminId: params.actor.adminUserId,
          changeReason: '관리자 예약 수정 (방문 시간 변경)',
        },
      });
    });
    return true;
  } catch (error) {
    if (error instanceof ConflictError) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 4. 시리즈 수정 (요일·시간·기간)
// ---------------------------------------------------------------------------

export type UpdateRecurringScheduleInput = {
  /** 'yyyy-MM-dd' */
  startDate: string;
  /** 시작일로부터 최대 {@link MAX_SCHEDULE_DAYS}일(1개월) 이내여야 한다. */
  endDate: string;
  /** bit0=일 ... bit6=토 */
  weekdaysMask: number;
  /** 'HH:mm' */
  dailyStartTime: string;
  dailyEndTime: string;
  approvalEnabled: boolean;
  autoEntryExitEnabled: boolean;
  /** true(기본값) 면 이 시리즈의 occurrence 는 관리자 "전체 예약" 목록에 나타나지 않는다. */
  hiddenFromReservationList: boolean;
};

export type UpdateRecurringScheduleResult = {
  /** 새 패턴에서 더 이상 해당하지 않아 실제로 취소된 건수 */
  cancelledCount: number;
  /** 날짜는 새 패턴에도 남아 있어, 취소·재생성 대신 방문 시간만 그 자리에서 바꾼 건수 */
  updatedCount: number;
  createdCount: number;
  skippedDates: string[];
};

/**
 * 반복 일정(요일·시간·기간) 자체를 수정한다. 대상 직원·주차면은 바꿀 수 없다
 * (바꾸려면 삭제 후 재등록). 이미 지난/진행 중인 occurrence 는 건드리지 않는다.
 *
 * 아직 방문 전인 미래 occurrence 는 **날짜 단위로 비교해서** 처리한다:
 *  - 새 패턴에도 그대로 남는 날짜는 건드리지 않는다.
 *  - 매일 시작/종료 시간만 바뀌어 방문 시간이 달라지는 날짜는, 취소 후 재생성하지
 *    않고 **기존 occurrence 의 시간만 그 자리에서 갱신**한다(`tryUpdateOccurrenceTime`).
 *    신청자가 존재도 몰랐던 예약이 "취소"라는 이력만 잔뜩 남기지 않도록 하기 위함이다.
 *    같은 주차면의 다른 예약과 새 시간대가 겹쳐 옮길 수 없는 경우에만 예외적으로
 *    취소하고 `skippedDates` 에 안내한다.
 *  - 더 이상 해당하지 않는 날짜만 취소하고, 새로 필요한 날짜만 만든다.
 *
 * 이렇게 하면 승인 생략/메일 생략 체크박스만 바꾸는 등 일정 자체는 그대로인 수정에서
 * 아무 occurrence 도 취소·재생성되지 않는다.
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

  // 오늘 이전 날짜는 다시 만들지 않는다 — 이미 지난 구간은 새 패턴으로 되돌릴 수 없다.
  const today = parseDateOnly(formatKstDate(now, settings.appTimeZone), 'startDate');
  const regenFrom = today.getTime() > startDate.getTime() ? today : startDate;

  const remainingDates = new Set(
    enumerateOccurrenceDates(regenFrom, endDate, input.weekdaysMask),
  );
  // 매일 시작/종료 시간이 바뀌면 같은 날짜라도 occurrence 의 방문 시간 자체가 달라진다 —
  // 이 경우 날짜가 겹치는 occurrence 는 취소·재생성 대신 시간만 그 자리에서 갱신한다.
  const dailyTimeChanged =
    input.dailyStartTime !== schedule.dailyStartTime ||
    input.dailyEndTime !== schedule.dailyEndTime;

  const futureOccurrences = await prisma.parkingReservation.findMany({
    where: {
      recurringScheduleId: scheduleId,
      reservationStatus: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
      visitStartAt: { gt: now },
    },
    select: { reservationId: true, reservationStatus: true, visitStartAt: true },
  });

  const skippedDates: string[] = [];
  const toCancel: { reservationId: number; reservationStatus: ReservationStatus }[] = [];
  const toUpdateTime: {
    reservationId: number;
    reservationStatus: ReservationStatus;
    dateStr: string;
  }[] = [];

  for (const occurrence of futureOccurrences) {
    const dateStr = formatKstDate(occurrence.visitStartAt, settings.appTimeZone);
    if (remainingDates.has(dateStr)) {
      // 날짜는 새 패턴에도 그대로 남는다.
      remainingDates.delete(dateStr);
      if (dailyTimeChanged) {
        toUpdateTime.push({ ...occurrence, dateStr });
      }
      // 시간도 안 바뀌었으면 아예 손대지 않는다(취소도, 갱신도 하지 않는다).
      continue;
    }
    toCancel.push(occurrence);
  }

  // 시간 이동을 먼저 시도하고, 그 주차면이 새 시간대에 이미 차 있어 옮길 수 없는
  // occurrence 만 취소 대상으로 넘긴다 — 신청자가 존재도 몰랐던 예약을 이유 없이
  // "취소"라는 이력으로 남기지 않기 위함이다.
  let updatedCount = 0;
  for (const { reservationId, reservationStatus, dateStr } of toUpdateTime) {
    const visitStartAt = zonedInputToUtc(
      `${dateStr}T${input.dailyStartTime}`,
      settings.appTimeZone,
    );
    const visitEndAt = zonedInputToUtc(`${dateStr}T${input.dailyEndTime}`, settings.appTimeZone);
    const moved = await tryUpdateOccurrenceTime({
      reservationId,
      spaceId: schedule.assignedSpaceId,
      visitStartAt,
      visitEndAt,
      bufferMinutes: settings.spaceBufferMinutes,
      actor,
    });
    if (moved) {
      updatedCount += 1;
    } else {
      toCancel.push({ reservationId, reservationStatus });
      skippedDates.push(dateStr);
    }
  }

  const cancelledCount = await cancelOccurrences(toCancel, '일정 변경', actor);

  await prisma.recurringReservationSchedule.update({
    where: { scheduleId },
    data: {
      startDate,
      endDate,
      weekdaysMask: input.weekdaysMask,
      dailyStartTime: input.dailyStartTime,
      dailyEndTime: input.dailyEndTime,
      approvalEnabled: input.approvalEnabled,
      autoEntryExitEnabled: input.autoEntryExitEnabled,
      hiddenFromReservationList: input.hiddenFromReservationList,
    },
  });

  let createdCount = 0;

  for (const dateStr of [...remainingDates].sort()) {
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
      approvalEnabled: input.approvalEnabled,
      doubleParkingEnabled: settings.doubleParkingEnabled,
      bufferMinutes: settings.spaceBufferMinutes,
      actor,
    });

    if (!created) {
      skippedDates.push(dateStr);
      continue;
    }
    createdCount += 1;
  }

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_SCHEDULE_UPDATE,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: scheduleId,
    detail: { cancelledCount, updatedCount, createdCount, skippedCount: skippedDates.length },
    context: actor.requestContext,
  });

  return { cancelledCount, updatedCount, createdCount, skippedDates };
}

// ---------------------------------------------------------------------------
// 5. 시리즈 삭제
// ---------------------------------------------------------------------------

/**
 * 반복 일정을 삭제한다. 사내 시스템 특성상 관리자 조작으로 행 자체가 사라지면 안
 * 되므로, DB 에서 지우지 않고 status 를 CANCELLED 로 바꾸는 소프트 삭제다(기록은
 * 영구 보존되고, 관리자 목록/감사 로그에는 계속 남는다). 아직 방문 전인 occurrence
 * 는 전부 취소하고, 이미 지난 occurrence(실제 방문 기록)는 그대로 남는다 — 시리즈
 * 행이 삭제되지 않으므로 recurringScheduleId 연결도 계속 유지된다.
 *
 * 이미 입차 처리(PARKING)된 occurrence는 상태 전이 규칙상(`PARKING -> EXITED`만
 * 허용) 여기서 취소할 수 없다 — 실제로 차가 그 자리에 있을 수 있기 때문이다. 조용히
 * 건너뛰면 관리자는 "취소했다"고 믿지만 그 주차면은 대시보드에 계속 "사용 중"으로
 * 남아 혼란스러우므로, 건너뛴 건수를 `stillParkedCount`로 명시해 알려준다 — 호출부가
 * "출차 처리 후 다시 확인해 주세요" 같은 안내를 보여줄 수 있게 하기 위함이다.
 */
export async function deleteRecurringSchedule(
  scheduleId: number,
  actor: AdminActionContext,
): Promise<{ cancelledCount: number; stillParkedCount: number }> {
  const schedule = await prisma.recurringReservationSchedule.findUnique({
    where: { scheduleId },
    select: { scheduleId: true },
  });
  if (!schedule) throw new NotFoundError('반복 예약 일정을 찾을 수 없습니다.');

  const activeOccurrences = await prisma.parkingReservation.findMany({
    where: {
      recurringScheduleId: scheduleId,
      reservationStatus: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
    },
    select: { reservationId: true, reservationStatus: true },
  });
  const cancelledCount = await cancelOccurrences(activeOccurrences, '예약 취소', actor);

  const stillParkedCount = await prisma.parkingReservation.count({
    where: { recurringScheduleId: scheduleId, reservationStatus: ReservationStatus.PARKING },
  });

  await prisma.recurringReservationSchedule.update({
    where: { scheduleId },
    data: { status: RecurringScheduleStatus.CANCELLED },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.RECURRING_SCHEDULE_DELETE,
    targetType: AUDIT_TARGETS.RECURRING_SCHEDULE,
    targetId: scheduleId,
    detail: { cancelledCount, stillParkedCount },
    context: actor.requestContext,
  });

  return { cancelledCount, stillParkedCount };
}
