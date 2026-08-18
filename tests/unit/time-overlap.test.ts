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
