import { describe, expect, it } from 'vitest';

import { buildOverlapWhere, isTimeRangeOverlapping } from '@/domain/time-overlap';

const at = (iso: string) => new Date(iso);

describe('시간 중복 판정', () => {
  it('구간이 일부라도 겹치면 true', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T02:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T03:00:00Z'),
      ),
    ).toBe(true);
  });

  it('새 예약이 기존 예약을 완전히 포함해도 true', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T02:00:00Z'),
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T03:00:00Z'),
      ),
    ).toBe(true);
  });

  it('기존 예약이 새 예약을 완전히 포함해도 true', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T05:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T02:00:00Z'),
      ),
    ).toBe(true);
  });

  it('경계가 맞닿는 경우(앞 예약 종료 == 뒤 예약 시작)는 중복이 아니다', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T02:00:00Z'),
      ),
    ).toBe(false);
  });

  it('완전히 떨어진 구간은 false', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T05:00:00Z'),
        at('2026-08-20T06:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('Prisma 중복 조건 생성', () => {
  it('요구사항 조건(start < newEnd AND end > newStart)을 그대로 만든다', () => {
    const start = at('2026-08-20T01:00:00Z');
    const end = at('2026-08-20T02:00:00Z');

    expect(buildOverlapWhere(start, end)).toEqual({
      visitStartAt: { lt: end },
      visitEndAt: { gt: start },
    });
  });
});

describe('주차면 버퍼 시간(bufferMinutes)', () => {
  it('버퍼가 0이면(생략 포함) 경계 맞닿음은 여전히 중복이 아니다', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T02:00:00Z'),
        0,
      ),
    ).toBe(false);
  });

  it('버퍼가 있으면 경계 맞닿음도 중복이 된다', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T02:00:00Z'),
        10,
      ),
    ).toBe(true);
  });

  it('간격이 버퍼보다 1분 짧으면 중복', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:09:00Z'),
        at('2026-08-20T02:00:00Z'),
        10,
      ),
    ).toBe(true);
  });

  it('간격이 버퍼와 정확히 같으면 중복이 아니다(경계값)', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:10:00Z'),
        at('2026-08-20T02:00:00Z'),
        10,
      ),
    ).toBe(false);
  });

  it('간격이 버퍼보다 넉넉하면 중복이 아니다', () => {
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T00:00:00Z'),
        at('2026-08-20T01:00:00Z'),
        at('2026-08-20T01:11:00Z'),
        at('2026-08-20T02:00:00Z'),
        10,
      ),
    ).toBe(false);
  });

  it('새 예약이 기존 예약보다 앞선 경우에도 대칭으로 적용된다', () => {
    // 새 예약 09:00-10:00, 기존 예약 10:09-11:00 (간격 9분, 버퍼 10분) → 중복
    expect(
      isTimeRangeOverlapping(
        at('2026-08-20T10:09:00Z'),
        at('2026-08-20T11:00:00Z'),
        at('2026-08-20T09:00:00Z'),
        at('2026-08-20T10:00:00Z'),
        10,
      ),
    ).toBe(true);
  });

  it('buildOverlapWhere 는 버퍼만큼 양쪽 구간을 넓힌다', () => {
    const start = at('2026-08-20T01:00:00Z');
    const end = at('2026-08-20T02:00:00Z');

    expect(buildOverlapWhere(start, end, 10)).toEqual({
      visitStartAt: { lt: at('2026-08-20T02:10:00Z') },
      visitEndAt: { gt: at('2026-08-20T00:50:00Z') },
    });
  });

  it('buildOverlapWhere 는 버퍼를 생략하면 기존과 동일한 결과를 만든다', () => {
    const start = at('2026-08-20T01:00:00Z');
    const end = at('2026-08-20T02:00:00Z');

    expect(buildOverlapWhere(start, end)).toEqual(buildOverlapWhere(start, end, 0));
  });
});
