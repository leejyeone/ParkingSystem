import type { ReservationStatus, SpaceType } from '@prisma/client';

import { RESERVATION_STATUS_LABEL, SPACE_TYPE_LABEL } from '@/domain/reservation-status';

const STATUS_CLASS: Record<ReservationStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
  PARKING: 'bg-blue-100 text-blue-800',
  EXITED: 'bg-slate-100 text-slate-600',
  NO_SHOW: 'bg-orange-100 text-orange-800',
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[status]}`} data-testid="status-badge">
      {RESERVATION_STATUS_LABEL[status]}
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
