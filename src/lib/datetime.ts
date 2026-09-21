import { addMinutes, differenceInMinutes } from 'date-fns';
import { ko } from 'date-fns/locale';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

import { getAppTimeZone } from '@/lib/env';

/**
 * 날짜/시간 처리 규칙
 *
 * - DB 에는 항상 UTC 기준 Date 로 저장한다. (Prisma DateTime)
 * - 사용자 입력(`datetime-local`)과 모든 화면/이메일 표시는 Asia/Seoul 기준이다.
 * - 서버의 OS 타임존에 의존하지 않도록 변환은 반드시 이 모듈을 거친다.
 */

export const KST = 'Asia/Seoul';

export function appTimeZone(): string {
  return getAppTimeZone();
}

export function nowUtc(): Date {
  return new Date();
}

/**
 * 'yyyy-MM-ddTHH:mm' 형태의 한국시각 문자열을 UTC Date 로 변환한다.
 * @throws 형식이 올바르지 않으면 Error
 */
export function zonedInputToUtc(input: string, timeZone = appTimeZone()): Date {
  const normalized = input.trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    throw new Error('날짜/시간 형식이 올바르지 않습니다. (예: 2026-08-20T09:00)');
  }
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const date = fromZonedTime(withSeconds, timeZone);
  if (Number.isNaN(date.getTime())) {
    throw new Error('날짜/시간 형식이 올바르지 않습니다. (예: 2026-08-20T09:00)');
  }
  return date;
}

/** UTC Date 를 `datetime-local` 입력값('yyyy-MM-ddTHH:mm')으로 변환 */
export function utcToZonedInput(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm");
}

/** 'yyyy-MM-dd' */
export function formatKstDate(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
}

/** 'HH:mm' */
export function formatKstTime(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, 'HH:mm');
}

/** 'M/d' (앞자리 0 없음, 예: '9/7', '12/19') — 법인차량 운행 내역 엑셀 등에서 쓴다. */
export function formatKstMonthDay(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, 'M/d');
}

/** 'yyyy-MM-dd HH:mm' */
export function formatKstDateTime(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd HH:mm');
}

/** 사람이 읽기 쉬운 형태: '2026년 08월 20일(목) 09:00' */
export function formatKstHuman(date: Date, timeZone = appTimeZone()): string {
  return formatInTimeZone(date, timeZone, 'yyyy년 MM월 dd일(EEE) HH:mm', { locale: ko });
}

/** 방문 구간 표기: '2026-08-20 09:00 ~ 11:00' (같은 날이면 종료는 시간만) */
export function formatKstRange(start: Date, end: Date, timeZone = appTimeZone()): string {
  const sameDay = formatKstDate(start, timeZone) === formatKstDate(end, timeZone);
  return sameDay
    ? `${formatKstDateTime(start, timeZone)} ~ ${formatKstTime(end, timeZone)}`
    : `${formatKstDateTime(start, timeZone)} ~ ${formatKstDateTime(end, timeZone)}`;
}

/** 한국시각 기준 하루(00:00:00 ~ 다음날 00:00:00)의 UTC 경계를 반환 */
export function kstDayRangeUtc(
  dateString: string,
  timeZone = appTimeZone(),
): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error('날짜 형식이 올바르지 않습니다. (예: 2026-08-20)');
  }
  const start = fromZonedTime(`${dateString}T00:00:00`, timeZone);
  const end = fromZonedTime(`${dateString}T00:00:00`, timeZone);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** 한국시각 기준 자정으로부터 경과한 분 (운영시간 비교용) */
export function kstMinutesOfDay(date: Date, timeZone = appTimeZone()): number {
  const zoned = toZonedTime(date, timeZone);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** 'HH:mm' 문자열을 자정 기준 분으로 변환 */
export function parseTimeOfDayToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error('시간 형식이 올바르지 않습니다. (예: 07:00)');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
    throw new Error('시간 형식이 올바르지 않습니다. (예: 07:00)');
  }
  return hour * 60 + minute;
}

/**
 * 신청 폼에서 선택할 수 있는 가장 이른 시각을 `datetime-local` 입력값으로 반환한다.
 * 서버에서 계산해 내려주므로 사용자의 기기 타임존과 무관하게 Asia/Seoul 기준이 된다.
 */
export function earliestSelectableInput(minLeadMinutes: number, timeZone = appTimeZone()): string {
  return utcToZonedInput(new Date(nowUtc().getTime() + minLeadMinutes * 60_000), timeZone);
}

/** 오늘(한국시각) 날짜 문자열 */
export function todayKstDateString(now: Date = nowUtc(), timeZone = appTimeZone()): string {
  return formatKstDate(now, timeZone);
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 'yyyy-MM-dd' 날짜 문자열을 days 만큼 이동한 'yyyy-MM-dd' 문자열로 반환한다. */
export function shiftKstDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 'yyyy-MM-dd' 날짜 문자열(달력 날짜)의 요일을 구한다. */
export function kstWeekdayLabel(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return WEEKDAY_LABEL[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export { addMinutes, differenceInMinutes };
