import type { SpaceType } from '@prisma/client';

import {
  DISPLAY_STATUS_LABEL,
  SPACE_TYPE_LABEL,
  type DisplayReservationStatus,
} from '@/domain/reservation-status';

export const STATUS_BADGE_CLASS: Readonly<Record<DisplayReservationStatus, string>> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-surface-active text-ink-muted',
  PARKING: 'bg-blue-100 text-blue-800',
  EXITED: 'bg-surface-hover text-ink-muted',
  NO_SHOW: 'bg-orange-100 text-orange-800',
  // 사용 중은 진행 중임이 드러나게, 사용 완료는 끝난 건이라 차분하게.
  IN_USE: 'bg-blue-100 text-blue-800',
  USED: 'bg-surface-hover text-ink-muted',
};

export function StatusBadge({
  status,
  label,
}: {
  status: DisplayReservationStatus;
  /** 주어지면 기본 문구 대신 이 문구를 쓴다(색상은 status 기준 그대로) — 법인차량처럼 같은
   * 상태값이라도 문구가 달라야 하는 화면에서 쓴다. */
  label?: string;
}) {
  return (
    <span className={`badge ${STATUS_BADGE_CLASS[status]}`} data-testid="status-badge">
      {label ?? DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}

const SPACE_TYPE_CLASS: Record<SpaceType, string> = {
  NORMAL: 'bg-surface-hover text-ink-muted',
  DOUBLE: 'bg-orange-100 text-orange-800',
  DISABLED: 'bg-indigo-100 text-indigo-800',
  EV: 'bg-teal-100 text-teal-800',
  UNAVAILABLE: 'bg-red-100 text-red-700',
};

/** 이중주차(DOUBLE)는 관리자 화면에서 경고 배지로 강조한다. */
export function SpaceTypeBadge({ spaceType }: { spaceType: SpaceType }) {
  return (
    <span className={`badge ${SPACE_TYPE_CLASS[spaceType]}`} data-testid="space-type-badge">
      {spaceType === 'DOUBLE' ? '⚠ ' : ''}
      {SPACE_TYPE_LABEL[spaceType]}
    </span>
  );
}

/** 법인 공용 차량 고정 배정 주차면 표시 — 평면도(`parking-map.tsx`)의 브랜드 블루와 톤을 맞춘다. */
export function CompanyVehicleBadge() {
  return (
    <span className="badge bg-brand-100 text-brand-700" data-testid="company-vehicle-badge">
      법인차량
    </span>
  );
}
