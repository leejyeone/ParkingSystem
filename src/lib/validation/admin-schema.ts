import {
  AccountStatus,
  AdminRole,
  EmailSendStatus,
  EmailType,
  RequesterType,
  ReservationStatus,
  SpaceType,
} from '@prisma/client';
import { z } from 'zod';

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
  loginId: z
    .string({ error: '로그인 ID를 입력해 주세요.' })
    .trim()
    .min(1, '로그인 ID를 입력해 주세요.')
    .max(50, '로그인 ID는 50자 이하로 입력해 주세요.'),
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(1, '비밀번호를 입력해 주세요.')
    .max(100, '비밀번호는 100자 이하로 입력해 주세요.'),
});

export const reservationListQuerySchema = z.object({
  date: dateStringSchema.optional(),
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

export const noShowReservationSchema = z.object({
  reason: optionalText(500, '처리 사유'),
});

export const assignSpaceSchema = z.object({
  spaceId: z.coerce.number().int().positive('주차면을 선택해 주세요.'),
});

export const parkingAreaCreateSchema = z.object({
  areaCode: requiredText(20, '구역 코드'),
  areaName: requiredText(100, '구역 이름'),
  description: optionalText(500, '설명'),
  /** 참고용 도면 이미지 경로 (좌표 정보는 저장하지 않음) */
  mapImageUrl: optionalText(500, '도면 이미지 URL'),
  displayOrder: z.coerce.number().int().min(0).max(10_000),
  isActive: z.boolean().default(true),
});

export const parkingAreaUpdateSchema = parkingAreaCreateSchema.partial();

export const parkingSpaceCreateSchema = z.object({
  areaId: z.coerce.number().int().positive('주차 구역을 선택해 주세요.'),
  spaceCode: requiredText(20, '주차면 코드'),
  spaceName: optionalText(100, '주차면 명칭'),
  spaceType: z.enum(SpaceType, { error: '주차면 유형을 선택해 주세요.' }),
  displayOrder: z.coerce.number().int().min(0).max(10_000),
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
    doubleParkingEnabled: z.boolean(),
    appTimeZone: requiredText(50, '타임존'),
  })
  .refine((values) => values.parkingOpenTime < values.parkingCloseTime, {
    error: '운영 종료 시간은 운영 시작 시간보다 늦어야 합니다.',
    path: ['parkingCloseTime'],
  });

export const adminUserCreateSchema = z.object({
  loginId: requiredText(50, '로그인 ID'),
  password: z.string({ error: '비밀번호를 입력해 주세요.' }).min(1, '비밀번호를 입력해 주세요.'),
  adminName: requiredText(50, '관리자 이름'),
  email: emailSchema,
  phone: optionalText(20, '연락처'),
  roleCode: z.enum(AdminRole, { error: '권한을 선택해 주세요.' }),
});

export const adminUserUpdateSchema = z.object({
  adminName: requiredText(50, '관리자 이름').optional(),
  email: emailSchema.optional(),
  phone: optionalText(20, '연락처'),
  roleCode: z.enum(AdminRole).optional(),
  accountStatus: z.enum(AccountStatus).optional(),
  password: z.string().min(1).optional(),
});

export const notificationEmailSchema = z.object({
  email: emailSchema,
  recipientName: optionalText(50, '수신자 이름'),
  receiveNewRequest: z.boolean().default(true),
  receiveApprovalAlert: z.boolean().default(true),
  receiveDailySummary: z.boolean().default(false),
  receiveDoubleParkingAlert: z.boolean().default(true),
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
  /** '1' 이면 개인정보 열람 계열 액션을 결과에서 제외한다. */
  excludeViews: z.literal('1').optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
