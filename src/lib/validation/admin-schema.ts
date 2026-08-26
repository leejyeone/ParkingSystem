import {
  AccountStatus,
  EmailSendStatus,
  EmailType,
  ReservationStatus,
  RequesterType,
  SpaceType,
} from '@prisma/client';
import { z } from 'zod';

import { zonedInputToUtc } from '@/lib/datetime';
import {
  dateStringSchema,
  emailSchema,
  optionalText,
  pageSchema,
  pageSizeSchema,
  requiredText,
  timeOfDaySchema,
} from '@/lib/validation/common';

/** 관리자 API 입력 스키마 */

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(1, '비밀번호를 입력해 주세요.')
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
});

export const reservationListQuerySchema = z.object({
  date: dateStringSchema.optional(),
  // 저장된 상태만 받는다. "사용 중"/"사용 완료"는 관리자 화면에서 쓰지 않는 파생 상태다.
  status: z.enum(ReservationStatus).optional(),
  requesterType: z.enum(RequesterType).optional(),
  vehicleNo: z.string().trim().max(20).optional(),
  requesterName: z.string().trim().max(50).optional(),
  spaceCode: z.string().trim().max(20).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const approveReservationSchema = z.object({
  spaceId: z.coerce.number().int().positive('주차면을 선택해 주세요.').optional().nullable(),
});

export const rejectReservationSchema = z.object({
  rejectionReason: requiredText(500, '반려 사유'),
});

export const bulkRejectReservationSchema = z.object({
  reservationIds: z
    .array(z.coerce.number().int().positive())
    .min(1, '반려할 예약을 하나 이상 선택해 주세요.')
    .max(200, '한 번에 최대 200건까지 처리할 수 있습니다.'),
  rejectionReason: requiredText(500, '반려 사유'),
});

export const noShowReservationSchema = z.object({
  reason: optionalText(500, '처리 사유'),
});

/** 'yyyy-MM-ddTHH:mm' 형식인지만 확인한다. 실제 타임존 변환은 라우트에서 zonedInputToUtc 로 한다. */
function isValidZonedInput(value: string): boolean {
  try {
    zonedInputToUtc(value);
    return true;
  } catch {
    return false;
  }
}

const DATETIME_FORMAT_MESSAGE = '날짜/시간 형식이 올바르지 않습니다. (예: 2026-08-20T09:00)';

export const markEntrySchema = z.object({
  actualEntryAt: z
    .string({ error: '입차 시각을 입력해 주세요.' })
    .refine(isValidZonedInput, DATETIME_FORMAT_MESSAGE),
});

export const markExitSchema = z.object({
  actualExitAt: z
    .string({ error: '출차 시각을 입력해 주세요.' })
    .refine(isValidZonedInput, DATETIME_FORMAT_MESSAGE),
});

/**
 * 실제 입·출차 기록 수정/삭제.
 *
 * 값을 보낸 필드만 바꾼다: 문자열이면 시각을 고치고, null 이면 기록을 지워 이전 상태로
 * 되돌린다(예: 입차 기록 삭제 → 승인 완료 상태로 복귀, 잘못 눌러 미방문 처리가 필요할 때 대비).
 * 필드를 아예 보내지 않으면 그 기록은 건드리지 않는다.
 */
export const entryExitRecordSchema = z.object({
  actualEntryAt: z
    .string()
    .refine(isValidZonedInput, DATETIME_FORMAT_MESSAGE)
    .nullable()
    .optional(),
  actualExitAt: z.string().refine(isValidZonedInput, DATETIME_FORMAT_MESSAGE).nullable().optional(),
});

export const assignSpaceSchema = z.object({
  spaceId: z.coerce.number().int().positive('주차면을 선택해 주세요.'),
});

/** 구역 코드와 정렬 순서는 화면에서 입력받지 않는다(내부 구분용, 서버가 자동 부여). */
export const parkingAreaCreateSchema = z.object({
  areaName: requiredText(100, '구역 이름'),
  description: optionalText(500, '설명'),
  isActive: z.boolean().default(true),
});

export const parkingAreaUpdateSchema = parkingAreaCreateSchema.partial();

/** 정렬 순서는 화면에서 입력받지 않는다(내부 구분용, 서버가 자동 부여). */
export const parkingSpaceCreateSchema = z.object({
  areaId: z.coerce.number().int().positive('주차 구역을 선택해 주세요.'),
  spaceCode: requiredText(20, '주차면 코드'),
  spaceName: optionalText(100, '주차면 명칭'),
  spaceType: z.enum(SpaceType, { error: '주차면 유형을 선택해 주세요.' }),
  isActive: z.boolean().default(true),
  memo: optionalText(500, '메모'),
});

export const parkingSpaceUpdateSchema = parkingSpaceCreateSchema.partial();

export const systemSettingsSchema = z
  .object({
    reservationMinLeadMinutes: z.coerce
      .number()
      .int()
      .min(0, '예약 최소 사전 신청 시간은 0분 이상이어야 합니다.')
      .max(1440, '예약 최소 사전 신청 시간은 1440분 이하로 설정해 주세요.'),
    parkingOpenTime: timeOfDaySchema,
    parkingCloseTime: timeOfDaySchema,
    exitReminderMinutes: z.coerce
      .number()
      .int()
      .min(1, '출차 알림 기준 시간은 1분 이상이어야 합니다.')
      .max(180, '출차 알림 기준 시간은 180분 이하로 설정해 주세요.'),
    maxReservationHours: z.coerce
      .number()
      .int()
      .min(1, '최대 예약 시간은 1시간 이상이어야 합니다.')
      .max(24, '최대 예약 시간은 24시간 이하로 설정해 주세요.'),
    spaceAssignmentEnabled: z.boolean(),
    parkingCapacity: z.coerce
      .number()
      .int()
      .min(1, '최대 주차 가능 대수는 1대 이상이어야 합니다.')
      .max(999, '최대 주차 가능 대수는 999대 이하로 설정해 주세요.'),
    doubleParkingEnabled: z.boolean(),
    appTimeZone: requiredText(50, '타임존'),
    entryExitManagementEnabled: z.boolean(),
    dashboardRefreshIntervalMinutes: z.coerce
      .number()
      .int()
      .min(1, '대시보드 자동 새로고침 주기는 1분 이상이어야 합니다.')
      .max(60, '대시보드 자동 새로고침 주기는 60분 이하로 설정해 주세요.'),
  })
  .refine((values) => values.parkingOpenTime < values.parkingCloseTime, {
    error: '운영 종료 시간은 운영 시작 시간보다 늦어야 합니다.',
    path: ['parkingCloseTime'],
  });

export const adminUserCreateSchema = z.object({
  email: emailSchema,
  password: z.string({ error: '비밀번호를 입력해 주세요.' }).min(1, '비밀번호를 입력해 주세요.'),
  adminName: requiredText(50, '관리자 이름'),
  phone: optionalText(20, '연락처'),
});

/**
 * 다른 관리자 계정 수정. 비밀번호는 여기 포함하지 않는다 — 관리자라도 남의 비밀번호를
 * 마음대로 바꿀 수 없고, 본인 비밀번호는 adminChangePasswordSchema 로만 바꾼다.
 */
export const adminUserUpdateSchema = z.object({
  email: emailSchema.optional(),
  adminName: requiredText(50, '관리자 이름').optional(),
  phone: optionalText(20, '연락처'),
  accountStatus: z.enum(AccountStatus).optional(),
});

export const adminChangePasswordSchema = z.object({
  currentPassword: z
    .string({ error: '현재 비밀번호를 입력해 주세요.' })
    .min(1, '현재 비밀번호를 입력해 주세요.'),
  newPassword: z
    .string({ error: '새 비밀번호를 입력해 주세요.' })
    .min(1, '새 비밀번호를 입력해 주세요.')
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
});

export const notificationEmailSchema = z.object({
  email: emailSchema,
  recipientName: optionalText(50, '수신자 이름'),
  receiveNewRequest: z.boolean().default(true),
  receiveApprovalAlert: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const emailLogQuerySchema = z.object({
  reservationNo: z.string().trim().max(30).optional(),
  emailType: z.enum(EmailType).optional(),
  sendStatus: z.enum(EmailSendStatus).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const auditLogQuerySchema = z.object({
  actionType: z.string().trim().max(50).optional(),
  targetType: z.string().trim().max(50).optional(),
  actorAdminId: z.coerce.number().int().positive().optional(),
  /**
   * 개인정보 열람 계열 액션은 건수가 많아 기본으로 제외한다.
   * '1' 을 주면 함께 조회한다.
   */
  includeViews: z.literal('1').optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
