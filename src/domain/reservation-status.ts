import { ReservationStatus } from '@prisma/client';

import { ENTRY_EXIT_MANAGEMENT_ENABLED } from '@/domain/feature-flags';
import { InvalidStateTransitionError } from '@/lib/errors';

/**
 * 시간 기반 파생 상태(사용 중 / 사용 완료) 사용 여부.
 * 입·출차 관리를 켜면 실제 입차 기록으로 상태가 붙으므로 파생 상태를 쓰지 않는다.
 */
export const DERIVED_STATUS_ENABLED = !ENTRY_EXIT_MANAGEMENT_ENABLED;

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

/**
 * 화면에 표시하는 상태.
 *
 * DB 의 reservation_status 에 더해, **승인 완료된 예약이 예정 시간에 도달했는지**로
 * 갈리는 두 가지를 얹은 것이다.
 *
 *   승인 완료 + 입차 예정 시각 경과        -> 사용 중
 *   승인 완료 + 출차 예정 시각까지 경과    -> 사용 완료
 *
 * DB 에 쓰지 않고 조회 시점에 계산한다. 관리자 조작 없이 시간만으로 결정되는 값이라
 * 별도 전환 작업이 필요 없고, 서버가 멈춰 있었어도 상태가 어긋나지 않는다.
 * (같은 이유로 대시보드의 주차면 점유 상태도 같은 방식으로 계산한다)
 */
export const DERIVED_RESERVATION_STATUSES = ['IN_USE', 'USED'] as const;

export type DerivedReservationStatus = (typeof DERIVED_RESERVATION_STATUSES)[number];

export type DisplayReservationStatus = ReservationStatus | DerivedReservationStatus;

export const DISPLAY_STATUS_LABEL: Readonly<Record<DisplayReservationStatus, string>> = {
  ...RESERVATION_STATUS_LABEL,
  IN_USE: '사용 중',
  USED: '사용 완료',
};

export function isDerivedReservationStatus(value: string): value is DerivedReservationStatus {
  return (DERIVED_RESERVATION_STATUSES as readonly string[]).includes(value);
}

/** 검색 조건으로 넘어올 수 있는 모든 값. (검증 스키마용) */
export const SELECTABLE_RESERVATION_STATUSES = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
  ReservationStatus.REJECTED,
  ReservationStatus.CANCELLED,
  ReservationStatus.PARKING,
  ReservationStatus.EXITED,
  ReservationStatus.NO_SHOW,
  ...DERIVED_RESERVATION_STATUSES,
] as const satisfies readonly DisplayReservationStatus[];

/**
 * 상태 필터 드롭다운에 실제로 노출할 값.
 *
 * 입·출차 관리를 쓰지 않는 동안에는 입차/출차/미방문으로 넘어갈 경로가 없어 항상 0건이 나온다.
 * 담당자가 "데이터가 안 들어갔나" 하고 헷갈리지 않도록 선택지에서 뺀다.
 * (이미 만들어진 링크로 들어오는 값은 검증 스키마가 그대로 받아 준다)
 */
export const RESERVATION_STATUS_FILTER_OPTIONS: readonly DisplayReservationStatus[] =
  DERIVED_STATUS_ENABLED
    ? [
        ReservationStatus.REQUESTED,
        ReservationStatus.APPROVED,
        'IN_USE',
        'USED',
        ReservationStatus.REJECTED,
        ReservationStatus.CANCELLED,
      ]
    : Object.values(ReservationStatus);

/**
 * 저장된 상태와 방문 예정 시간으로 화면 표시용 상태를 구한다.
 *
 * 입·출차 관리를 쓰는 경우에는 실제 입차 기록으로 PARKING/EXITED 가 붙으므로,
 * 시간만 보고 "사용 중" 이라고 단정하면 미방문 차량까지 사용 중으로 보인다.
 * 그래서 입·출차 관리가 꺼져 있을 때만 시간으로 판단한다.
 */
export function resolveDisplayStatus(
  reservation: { reservationStatus: ReservationStatus; visitStartAt: Date; visitEndAt: Date },
  now: Date = new Date(),
): DisplayReservationStatus {
  if (!DERIVED_STATUS_ENABLED) return reservation.reservationStatus;
  if (reservation.reservationStatus !== ReservationStatus.APPROVED) {
    return reservation.reservationStatus;
  }

  const nowMs = now.getTime();
  if (nowMs >= reservation.visitEndAt.getTime()) return 'USED';
  if (nowMs >= reservation.visitStartAt.getTime()) return 'IN_USE';
  return reservation.reservationStatus;
}

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
