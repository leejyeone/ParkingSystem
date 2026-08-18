import { describe, expect, it } from 'vitest';

import {
  assertReservationTiming,
  checkMinimumLeadTime,
  checkOperatingHours,
  checkRequesterCanChange,
  checkVisitRange,
  getRequesterChangeDeadline,
} from '@/domain/reservation-rules';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { ValidationError } from '@/lib/errors';
import { zonedInputToUtc } from '@/lib/datetime';

/** 한국시각 문자열을 UTC Date 로 */
const kst = (value: string) => zonedInputToUtc(value);

describe('최소 사전 신청 시간(60분) 검증', () => {
  const now = kst('2026-08-20T09:00');

  it('정확히 60분 뒤는 허용한다', () => {
    expect(checkMinimumLeadTime(kst('2026-08-20T10:00'), now, 60)).toBeNull();
  });

  it('60분 뒤보다 이후는 허용한다', () => {
    expect(checkMinimumLeadTime(kst('2026-08-20T14:00'), now, 60)).toBeNull();
  });

  it('59분 뒤는 거부한다', () => {
    expect(checkMinimumLeadTime(kst('2026-08-20T09:59'), now, 60)).toContain('60분');
  });

  it('과거 시각은 거부한다', () => {
    expect(checkMinimumLeadTime(kst('2026-08-20T08:00'), now, 60)).not.toBeNull();
  });
});

describe('방문 구간 검증', () => {
  it('종료가 시작보다 늦어야 한다', () => {
    expect(checkVisitRange(kst('2026-08-20T10:00'), kst('2026-08-20T11:00'), 12)).toBeNull();
    expect(checkVisitRange(kst('2026-08-20T10:00'), kst('2026-08-20T10:00'), 12)).toContain(
      '출차 예정 시간',
    );
    expect(checkVisitRange(kst('2026-08-20T10:00'), kst('2026-08-20T09:00'), 12)).not.toBeNull();
  });

  it('최대 예약 시간을 초과하면 거부한다', () => {
    expect(checkVisitRange(kst('2026-08-20T08:00'), kst('2026-08-20T21:00'), 12)).toContain(
      '12시간',
    );
  });
});

describe('운영시간 검증', () => {
  it('운영시간 내면 통과한다', () => {
    expect(
      checkOperatingHours(kst('2026-08-20T09:00'), kst('2026-08-20T18:00'), '07:00', '22:00'),
    ).toBeNull();
  });

  it('운영 시작 이전 입차는 거부한다', () => {
    expect(
      checkOperatingHours(kst('2026-08-20T06:30'), kst('2026-08-20T09:00'), '07:00', '22:00'),
    ).toContain('입차');
  });

  it('운영 종료 이후 출차는 거부한다', () => {
    expect(
      checkOperatingHours(kst('2026-08-20T20:00'), kst('2026-08-20T23:00'), '07:00', '22:00'),
    ).toContain('출차');
  });

  it('날짜를 넘기는 예약은 거부한다', () => {
    expect(
      checkOperatingHours(kst('2026-08-20T21:00'), kst('2026-08-21T08:00'), '07:00', '22:00'),
    ).toContain('같은 날짜');
  });

  it('경계 시각(07:00 시작, 22:00 종료)은 허용한다', () => {
    expect(
      checkOperatingHours(kst('2026-08-20T07:00'), kst('2026-08-20T22:00'), '07:00', '22:00'),
    ).toBeNull();
  });
});

describe('예약 시간 통합 검증', () => {
  const now = kst('2026-08-20T09:00');

  it('모든 규칙을 만족하면 예외를 던지지 않는다', () => {
    expect(() =>
      assertReservationTiming({
        visitStartAt: kst('2026-08-20T11:00'),
        visitEndAt: kst('2026-08-20T13:00'),
        now,
        settings: DEFAULT_SETTINGS,
      }),
    ).not.toThrow();
  });

  it('규칙 위반 시 필드별 오류를 담은 ValidationError 를 던진다', () => {
    try {
      assertReservationTiming({
        visitStartAt: kst('2026-08-20T09:30'),
        visitEndAt: kst('2026-08-20T09:00'),
        now,
        settings: DEFAULT_SETTINGS,
      });
      throw new Error('여기에 도달하면 안 된다');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.fieldErrors?.visitStartAt?.[0]).toContain('60분');
      expect(validationError.fieldErrors?.visitEndAt?.[0]).toContain('출차 예정 시간');
    }
  });
});

describe('신청자 수정/취소 가능 시간 검증', () => {
  const visitStartAt = kst('2026-08-20T14:00');

  it('마감 시각은 방문 시작 60분 전이다', () => {
    expect(getRequesterChangeDeadline(visitStartAt, 60).toISOString()).toBe(
      kst('2026-08-20T13:00').toISOString(),
    );
  });

  it('마감 이전이면 수정/취소가 가능하다', () => {
    expect(
      checkRequesterCanChange({
        status: 'APPROVED',
        visitStartAt,
        now: kst('2026-08-20T12:59'),
        minLeadMinutes: 60,
      }),
    ).toEqual({ allowed: true });
  });

  it('마감을 지나면 사유와 함께 차단한다', () => {
    const result = checkRequesterCanChange({
      status: 'APPROVED',
      visitStartAt,
      now: kst('2026-08-20T13:30'),
      minLeadMinutes: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toContain('60분 전');
  });

  it('이미 종료된 상태는 수정/취소할 수 없다', () => {
    for (const status of ['CANCELLED', 'REJECTED', 'EXITED', 'NO_SHOW', 'PARKING'] as const) {
      const result = checkRequesterCanChange({
        status,
        visitStartAt,
        now: kst('2026-08-20T10:00'),
        minLeadMinutes: 60,
      });
      expect(result.allowed).toBe(false);
    }
  });
});
