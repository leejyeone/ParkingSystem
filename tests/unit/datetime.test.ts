import { describe, expect, it } from 'vitest';

import {
  formatKstDate,
  formatKstDateTime,
  formatKstRange,
  formatKstTime,
  kstDayRangeUtc,
  kstMinutesOfDay,
  parseTimeOfDayToMinutes,
  utcToZonedInput,
  zonedInputToUtc,
} from '@/lib/datetime';

describe('Asia/Seoul 기준 시간 변환', () => {
  it('한국시각 입력을 UTC 로 변환한다 (KST = UTC+9)', () => {
    expect(zonedInputToUtc('2026-08-20T09:00').toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(zonedInputToUtc('2026-08-20T00:00').toISOString()).toBe('2026-08-19T15:00:00.000Z');
  });

  it('공백 구분자와 초 단위 입력도 허용한다', () => {
    expect(zonedInputToUtc('2026-08-20 09:00').toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(zonedInputToUtc('2026-08-20T09:00:30').toISOString()).toBe('2026-08-20T00:00:30.000Z');
  });

  it('형식이 잘못되면 오류를 던진다', () => {
    expect(() => zonedInputToUtc('2026/08/20 09:00')).toThrow();
    expect(() => zonedInputToUtc('')).toThrow();
  });

  it('UTC → datetime-local 입력값으로 되돌릴 수 있다 (왕복 변환)', () => {
    const input = '2026-08-20T14:30';
    expect(utcToZonedInput(zonedInputToUtc(input))).toBe(input);
  });
});

describe('한국시각 표시 포맷', () => {
  const date = new Date('2026-08-20T00:00:00Z'); // KST 09:00

  it('날짜/시간을 한국시각으로 표시한다', () => {
    expect(formatKstDate(date)).toBe('2026-08-20');
    expect(formatKstTime(date)).toBe('09:00');
    expect(formatKstDateTime(date)).toBe('2026-08-20 09:00');
  });

  it('같은 날 구간은 종료를 시간만 표시한다', () => {
    expect(formatKstRange(date, new Date('2026-08-20T02:00:00Z'))).toBe('2026-08-20 09:00 ~ 11:00');
  });

  it('날짜가 바뀌는 구간은 종료도 날짜까지 표시한다', () => {
    expect(formatKstRange(date, new Date('2026-08-20T16:00:00Z'))).toBe(
      '2026-08-20 09:00 ~ 2026-08-21 01:00',
    );
  });
});

describe('한국시각 기준 하루 범위', () => {
  it('KST 00:00 ~ 다음날 00:00 을 UTC 로 반환한다', () => {
    const { start, end } = kstDayRangeUtc('2026-08-20');

    expect(start.toISOString()).toBe('2026-08-19T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-20T15:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('형식이 잘못되면 오류를 던진다', () => {
    expect(() => kstDayRangeUtc('20260820')).toThrow();
  });
});

describe('운영시간 비교용 분 변환', () => {
  it('한국시각 기준 자정으로부터의 분을 계산한다', () => {
    expect(kstMinutesOfDay(new Date('2026-08-20T00:00:00Z'))).toBe(9 * 60);
    expect(kstMinutesOfDay(new Date('2026-08-19T22:00:00Z'))).toBe(7 * 60);
  });

  it("'HH:mm' 문자열을 분으로 변환한다", () => {
    expect(parseTimeOfDayToMinutes('07:00')).toBe(420);
    expect(parseTimeOfDayToMinutes('22:00')).toBe(1320);
    expect(() => parseTimeOfDayToMinutes('25:00')).toThrow();
    expect(() => parseTimeOfDayToMinutes('7시')).toThrow();
  });
});
