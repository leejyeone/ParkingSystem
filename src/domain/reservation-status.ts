import { ReservationStatus } from '@prisma/client';

import { InvalidStateTransitionError } from '@/lib/errors';

/**
 * 예약 상태 전이 규칙.
 *
 *   REQUESTED -> APPROVED / REJECTED / CANCELLED
 *   APPROVED  -> PARKING / CANCELLED / NO_SHOW
 *   PARKING   -> EXITED
 *   REJECTED / CANCELLED / EXITED / NO_SHOW 는 종료 상태
 *
 * 화면뿐 아니라 API/서비스 계층에서도 반드시 이 규칙으로 차단한다.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PARKING', 'CANCELLED', 'NO_SHOW'],
  PARKING: ['EXITED'],
  REJECTED: [],
  CANCELLED: [],
  EXITED: [],
  NO_SHOW: [],
} as const;

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(
      `'${RESERVATION_STATUS_LABEL[from]}' 상태에서는 '${RESERVATION_STATUS_LABEL[to]}' (으)로 변경할 수 없습니다.`,
    );
  }
}

/** 종료(더 이상 전이 불가) 상태 여부 */
export function isTerminalStatus(status: ReservationStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** 주차면을 실제로 점유하는 상태 (중복 배정 검증 대상) */
export const SPACE_OCCUPYING_STATUSES: readonly ReservationStatus[] = ['APPROVED', 'PARKING'];

/**
 * 신청자가 수정/취소를 시도할 수 있는 상태.
 *
 * 승인 완료 이후에는 주차면 배정과 관리자 확인이 끝난 상태이므로 신청자가 직접 바꿀 수 없다.
 * 변경이 필요하면 담당자에게 문의하도록 안내한다.
 */
export const REQUESTER_MODIFIABLE_STATUSES: readonly ReservationStatus[] = ['REQUESTED'];

export const RESERVATION_STATUS_LABEL: Readonly<Record<ReservationStatus, string>> = {
  REQUESTED: '승인 대기',
  APPROVED: '승인 완료',
  REJECTED: '반려',
  CANCELLED: '취소',
  PARKING: '입차',
  EXITED: '출차',
  NO_SHOW: '미방문',
};

export const REQUESTER_TYPE_LABEL = {
  VISITOR: '방문객',
  EMPLOYEE: '직원',
} as const;

export const SPACE_TYPE_LABEL = {
  NORMAL: '일반',
  DOUBLE: '이중주차',
  DISABLED: '장애인',
  EV: '전기차',
  UNAVAILABLE: '사용불가',
} as const;
