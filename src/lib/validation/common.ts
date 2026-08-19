import { z } from 'zod';

import { zonedInputToUtc } from '@/lib/datetime';
import { isValidVehicleNo, normalizeVehicleNo, VEHICLE_NO_ERROR_MESSAGE } from '@/lib/vehicle';

/** 공통 필드 스키마. 오류 메시지는 모두 한국어로 작성한다. */

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** 'yyyy-MM-ddTHH:mm' (Asia/Seoul) 문자열을 UTC Date 로 변환 */
export const zonedDateTimeSchema = z
  .string({ error: '날짜와 시간을 입력해 주세요.' })
  .trim()
  .min(1, '날짜와 시간을 입력해 주세요.')
  .refine(
    (value) => DATE_TIME_PATTERN.test(value.replace(' ', 'T')),
    '날짜/시간 형식이 올바르지 않습니다. (예: 2026-08-20 09:00)',
  )
  .transform((value) => zonedInputToUtc(value));

/** 'yyyy-MM-dd' */
export const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다. (예: 2026-08-20)');

/** 'HH:mm' */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시간 형식이 올바르지 않습니다. (예: 07:00)');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export const emailSchema = z
  .string({ error: '이메일을 입력해 주세요.' })
  .trim()
  .min(1, '이메일을 입력해 주세요.')
  .max(255, '이메일은 255자 이하로 입력해 주세요.')
  .refine(
    (value) => EMAIL_PATTERN.test(value),
    '이메일 형식이 올바르지 않습니다. (예: hong@example.com)',
  )
  .transform((value) => value.toLowerCase());

export const vehicleNoSchema = z
  .string({ error: '차량번호를 입력해 주세요.' })
  .trim()
  .min(1, '차량번호를 입력해 주세요.')
  .transform((value) => normalizeVehicleNo(value))
  .refine((value) => isValidVehicleNo(value), VEHICLE_NO_ERROR_MESSAGE);

/** 빈 문자열을 null 로 바꾸는 선택 입력 */
export function optionalText(maxLength: number, label: string) {
  return z
    .string()
    .trim()
    .max(maxLength, `${label}은(는) ${maxLength}자 이하로 입력해 주세요.`)
    .optional()
    .nullable()
    .transform((value) => (value === undefined || value === '' ? null : value));
}

export function requiredText(maxLength: number, label: string) {
  return z
    .string({ error: `${label}을(를) 입력해 주세요.` })
    .trim()
    .min(1, `${label}을(를) 입력해 주세요.`)
    .max(maxLength, `${label}은(는) ${maxLength}자 이하로 입력해 주세요.`);
}

export const pageSchema = z.coerce.number().int().min(1).default(1);
export const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);

/**
 * 일반 사용자(회원) 비밀번호 최소 길이.
 *
 * 관리자와 달리 문자 종류 조건은 두지 않는다. 회원 가입은 자동완성 편의를 위한 선택 기능이고,
 * 회원은 자기 예약만 볼 수 있어 관리자 계정과 위험도가 다르기 때문이다.
 * (관리자 정책은 src/lib/password.ts 의 PASSWORD_POLICY_MESSAGE 참고)
 */
export const USER_PASSWORD_MIN_LENGTH = 8;

export const USER_PASSWORD_POLICY_MESSAGE = `비밀번호는 ${USER_PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`;
