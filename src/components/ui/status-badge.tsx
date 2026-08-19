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
  CANCELLED: 'bg-slate-200 text-slate-600',
  PARKING: 'bg-blue-100 text-blue-800',
  EXITED: 'bg-slate-100 text-slate-600',
  NO_SHOW: 'bg-orange-100 text-orange-800',
  // 사용 중은 진행 중임이 드러나게, 사용 완료는 끝난 건이라 차분하게.
  IN_USE: 'bg-blue-100 text-blue-800',
  USED: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status }: { status: DisplayReservationStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE_CLASS[status]}`} data-testid="status-badge">
      {DISPLAY_STATUS_LABEL[status]}
    </span>
  );
}

const SPACE_TYPE_CLASS: Record<SpaceType, string> = {
  NORMAL: 'bg-slate-100 text-slate-700',
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
