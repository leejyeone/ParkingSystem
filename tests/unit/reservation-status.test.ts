import { ReservationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminalStatus,
} from '@/domain/reservation-status';
import { InvalidStateTransitionError } from '@/lib/errors';

describe('예약 상태 전이 규칙', () => {
  it('REQUESTED 는 APPROVED / REJECTED / CANCELLED 로만 갈 수 있다', () => {
    expect(canTransition('REQUESTED', 'APPROVED')).toBe(true);
    expect(canTransition('REQUESTED', 'REJECTED')).toBe(true);
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('REQUESTED', 'PARKING')).toBe(false);
    expect(canTransition('REQUESTED', 'EXITED')).toBe(false);
    expect(canTransition('REQUESTED', 'NO_SHOW')).toBe(false);
  });

  it('APPROVED 는 PARKING / CANCELLED / NO_SHOW 로만 갈 수 있다', () => {
    expect(canTransition('APPROVED', 'PARKING')).toBe(true);
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(true);
    expect(canTransition('APPROVED', 'NO_SHOW')).toBe(true);
    expect(canTransition('APPROVED', 'EXITED')).toBe(false);
    expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
  });

  it('PARKING 은 EXITED 로만 갈 수 있다', () => {
    expect(canTransition('PARKING', 'EXITED')).toBe(true);
    expect(canTransition('PARKING', 'CANCELLED')).toBe(false);
    expect(canTransition('PARKING', 'NO_SHOW')).toBe(false);
  });

  it('종료 상태에서는 어떤 전이도 허용하지 않는다', () => {
    for (const status of ['REJECTED', 'CANCELLED', 'EXITED', 'NO_SHOW'] as const) {
      expect(isTerminalStatus(status)).toBe(true);
      for (const target of Object.values(ReservationStatus)) {
        expect(canTransition(status, target)).toBe(false);
      }
    }
  });

  it('허용되지 않은 전이는 예외를 던진다', () => {
    expect(() => assertTransition('REQUESTED', 'EXITED')).toThrow(InvalidStateTransitionError);
    expect(() => assertTransition('APPROVED', 'PARKING')).not.toThrow();
  });

  it('예외 메시지는 한국어 상태명을 포함한다', () => {
    expect(() => assertTransition('EXITED', 'PARKING')).toThrow(/출차/);
  });

  it('모든 상태에 전이 규칙이 정의되어 있다', () => {
    for (const status of Object.values(ReservationStatus)) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });
});
