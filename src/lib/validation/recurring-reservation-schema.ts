import { z } from 'zod';

import {
  dateStringSchema,
  emailSchema,
  optionalText,
  requiredText,
  timeOfDaySchema,
  vehicleNoSchema,
} from '@/lib/validation/common';

/** 요일 7개(일~토) 선택을 받아 서비스 계층이 쓰는 비트마스크(bit0=일 ... bit6=토)로 변환한다. */
const weekdaysSchema = z
  .array(z.boolean())
  .length(7, '요일 배열은 일~토 7개여야 합니다.')
  .refine((days) => days.some(Boolean), '반복할 요일을 하나 이상 선택해 주세요.')
  .transform((days) =>
    days.reduce((mask, checked, index) => (checked ? mask | (1 << index) : mask), 0),
  );

/** 반복 패턴(기간·요일·매일 시간대) 공통 필드. 등록/수정 양쪽에서 재사용한다. */
const schedulePatternFields = {
  startDate: dateStringSchema,
  /** 시작일로부터 최대 1개월(31일) 이내여야 한다 — 서비스 계층에서 재검증한다. */
  endDate: dateStringSchema,
  weekdays: weekdaysSchema,
  dailyStartTime: timeOfDaySchema,
  dailyEndTime: timeOfDaySchema,
  approvalEnabled: z.boolean().default(true),
  autoEntryExitEnabled: z.boolean().default(false),
  hiddenFromReservationList: z.boolean().default(true),
};

export const createRecurringScheduleSchema = z
  .object({
    employeeUserId: z.coerce.number().int().positive('대상 직원을 선택해 주세요.'),
    spaceId: z.coerce.number().int().positive('주차면을 선택해 주세요.'),
    requesterName: requiredText(50, '성명'),
    requesterEmail: emailSchema,
    companyOrBranchName: optionalText(100, '소속 사업장명'),
    vehicleNo: vehicleNoSchema,
    ...schedulePatternFields,
  })
  .refine((value) => value.dailyEndTime > value.dailyStartTime, {
    error: '종료 시간은 시작 시간보다 늦어야 합니다.',
    path: ['dailyEndTime'],
  });

/** 반복 일정(요일·시간·기간) 수정. 대상 직원·주차면은 바꿀 수 없다. */
export const updateRecurringScheduleSchema = z
  .object(schedulePatternFields)
  .refine((value) => value.dailyEndTime > value.dailyStartTime, {
    error: '종료 시간은 시작 시간보다 늦어야 합니다.',
    path: ['dailyEndTime'],
  });

/** 반복 예약 시리즈 중 특정 날짜(occurrence) 하나를 제외(취소)한다. */
export const skipRecurringOccurrenceSchema = z.object({
  reason: requiredText(200, '제외 사유'),
});
