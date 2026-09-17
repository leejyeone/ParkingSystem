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

/**
 * 방문 예약과 법인차량 운행 신청이 함께 쓰는 상태 라벨.
 *
 * PARKING/EXITED는 일부러 "입차"/"출차"처럼 물리적 방향을 못박지 않고 "사용 중"/"사용
 * 완료"로 표현한다 — 방문 예약은 들어왔다 나가는 방향이지만 법인차량은 차가 먼저
 * 나갔다가 돌아오는 반대 방향이라, 방향을 못박은 단어를 쓰면 둘 중 한쪽에서 뜻이
 * 뒤집힌다. "지금 자원을 쓰고 있는지/다 썼는지"는 방향과 무관하게 항상 같은 뜻이라
 * 도메인별로 라벨을 따로 뒤집을 필요가 없어진다.
 */
export const RESERVATION_STATUS_LABEL: Readonly<Record<ReservationStatus, string>> = {
  REQUESTED: '승인 대기',
  APPROVED: '승인 완료',
  REJECTED: '반려',
  CANCELLED: '취소',
  PARKING: '사용 중',
  EXITED: '사용 완료',
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

/** 실제 입·출차 관리를 켜야만 도달할 수 있는 상태 (markEntry/markExit/markNoShow 참고) */
const ENTRY_EXIT_ONLY_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PARKING,
  ReservationStatus.EXITED,
  ReservationStatus.NO_SHOW,
];

/**
 * 관리자 예약 목록/상세에서 노출·검색에 쓰는 상태 값. (필터 드롭다운 + 검증 스키마 공용)
 *
 * 저장된 실제 상태만 포함한다. "사용 중"/"사용 완료"는 실제 입·출차 기록이 아니라 방문 예정
 * 시간만 보고 추측한 값이라, 관리자 화면에서는 실제로 관리되는 정보로 오해할 수 있어 빼둔다.
 * (신청자 조회 화면은 계속 이 파생 상태를 보여준다 — resolveDisplayStatus 참고)
 *
 * 입·출차 관리를 껐으면 입차/출차/미방문으로는 절대 바뀌지 않으므로(assertEntryExitEnabled 가
 * 막는다), 그 세 상태는 필터에서도 뺀다. 과거에 켰다가 꺼서 이미 그 상태로 남아있는 예약이
 * 있어도 필터 목록에서는 노출하지 않는다 — 사용자 요청에 따른 단순화.
 */
export function reservationStatusFilterOptions(
  entryExitManagementEnabled: boolean,
): readonly ReservationStatus[] {
  const all = Object.values(ReservationStatus);
  return entryExitManagementEnabled
    ? all
    : all.filter((status) => !ENTRY_EXIT_ONLY_STATUSES.includes(status));
}

/**
 * 저장된 상태와 방문 예정 시간으로 화면 표시용 상태를 구한다. (신청자 조회 화면 전용)
 *
 * 입·출차 관리를 켜면 실제 입차 기록으로 PARKING/EXITED 가 붙으므로 저장된 상태를 그대로 쓴다.
 * 껐을 때는 실제 출입 기록이 없으므로, 시간만 보고 "사용 중"이라고 추정한다.
 * (관리자 예약 목록/상세는 이 함수를 쓰지 않는다 — 저장된 상태만 보여준다)
 */
export function resolveDisplayStatus(
  reservation: { reservationStatus: ReservationStatus; visitStartAt: Date; visitEndAt: Date },
  entryExitManagementEnabled: boolean,
  now: Date = new Date(),
): DisplayReservationStatus {
  if (entryExitManagementEnabled) return reservation.reservationStatus;
  if (reservation.reservationStatus !== ReservationStatus.APPROVED) {
    return reservation.reservationStatus;
  }

  const nowMs = now.getTime();
  if (nowMs >= reservation.visitEndAt.getTime()) return 'USED';
  if (nowMs >= reservation.visitStartAt.getTime()) return 'IN_USE';
  return reservation.reservationStatus;
}

/**
 * 법인차량 전용 표시 상태.
 *
 * 법인차량은 입·출차 관리 개념 자체가 없다(설정과 무관하게 항상 `resolveDisplayStatus`의
 * "꺼짐" 분기와 같은 처리) — 직원이 신청 시간대로 알아서 사용하고, "반납 처리"를 눌러야만
 * PARKING(반납 대기)으로 실제 전이된다. 그래서 APPROVED 상태에서 "지금 사용 중인지/기간이
 * 지났는지"는 방문 예약처럼 시간만 보고 추측할 수밖에 없다. PARKING/EXITED는 반납 처리·확정
 * 이라는 실제 사건으로만 도달하므로 그대로 저장된 상태를 쓴다(추측할 필요가 없다).
 *
 * 관리자 화면은 이 함수를 쓰지 않고 저장된 실제 상태만 보여준다(방문 예약과 같은 원칙 —
 * `resolveDisplayStatus` 위 주석 참고). 직원 본인 화면에서만 쓴다.
 */
export function resolveCompanyVehicleDisplayStatus(
  trip: { tripStatus: ReservationStatus; requestStartAt: Date; requestEndAt: Date },
  now: Date = new Date(),
): DisplayReservationStatus {
  if (trip.tripStatus !== ReservationStatus.APPROVED) return trip.tripStatus;

  const nowMs = now.getTime();
  if (nowMs >= trip.requestEndAt.getTime()) return 'USED';
  if (nowMs >= trip.requestStartAt.getTime()) return 'IN_USE';
  return trip.tripStatus;
}

/**
 * 법인차량 전용 상태 라벨. 방문 예약과 공유하는 `RESERVATION_STATUS_LABEL`을 베이스로,
 * PARKING/EXITED만 "반납 대기"/"반납 완료"로 다시 쓴다(트리거 주체가 관리자에서 직원·관리자
 * 확인으로 바뀌었기 때문 — `StatusBadge`의 `label` 오버라이드로 화면마다 적용한다).
 */
export const COMPANY_VEHICLE_STATUS_LABEL: Readonly<Record<DisplayReservationStatus, string>> = {
  ...DISPLAY_STATUS_LABEL,
  PARKING: '반납 대기',
  EXITED: '반납 완료',
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
