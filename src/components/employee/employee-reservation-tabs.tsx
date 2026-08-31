'use client';

import { useState } from 'react';
import Link from 'next/link';

import { StatusBadge } from '@/components/ui/status-badge';
import { formatKstRange } from '@/lib/datetime';
import type { RecurringScheduleListItem } from '@/services/recurring-reservation-service';
import type { ReservationListItem } from '@/services/reservation-service';

const SCHEDULE_STATUS_LABEL = { ACTIVE: '진행 중', CANCELLED: '취소됨' } as const;
const SCHEDULE_STATUS_CLASS = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-surface-active text-ink-muted',
} as const;

/**
 * 직원 "내 예약" 목록 — 일반 예약과 반복 예약을 탭으로 나눠 보여준다.
 * 반복 예약은 관리자 반복 예약 목록과 같은 방식으로, occurrence 를 하나씩 나열하지
 * 않고 시리즈당 한 줄(주차면·기간·요일·시간대·상태) 요약만 보여준다.
 */
export function EmployeeReservationTabs({
  reservations,
  schedules,
  showSpace,
  page,
  totalPages,
  totalCount,
}: {
  reservations: ReservationListItem[];
  schedules: RecurringScheduleListItem[];
  showSpace: boolean;
  /** 일반 예약 목록의 현재 페이지(서버에서 페이지네이션한다). */
  page: number;
  totalPages: number;
  /** 일반 예약 전체 건수(페이지 무관) — 탭 라벨의 개수 표기에 쓴다. */
  totalCount: number;
}) {
  const [tab, setTab] = useState<'normal' | 'recurring'>('normal');

  return (
    <div>
      {schedules.length > 0 && (
        <nav className="bg-surface-hover mb-3 flex gap-1 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab('normal')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-bold transition ${
              tab === 'normal'
                ? 'bg-brand-700 text-white'
                : 'text-ink-muted hover:bg-surface-active'
            }`}
          >
            일반 예약 ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('recurring')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-bold transition ${
              tab === 'recurring'
                ? 'bg-brand-700 text-white'
                : 'text-ink-muted hover:bg-surface-active'
            }`}
          >
            반복 예약 ({schedules.length})
          </button>
        </nav>
      )}

      {tab === 'normal' ? (
        <NormalList
          reservations={reservations}
          showSpace={showSpace}
          page={page}
          totalPages={totalPages}
        />
      ) : (
        <ScheduleList schedules={schedules} />
      )}
    </div>
  );
}

function NormalList({
  reservations,
  showSpace,
  page,
  totalPages,
}: {
  reservations: ReservationListItem[];
  showSpace: boolean;
  page: number;
  totalPages: number;
}) {
  if (reservations.length === 0) {
    return <p className="text-ink-faint mt-4 text-sm">아직 신청한 일반 예약이 없습니다.</p>;
  }

  return (
    <>
      <ul className="mt-3 space-y-3">
        {reservations.map((reservation) => (
          <li key={reservation.reservationId}>
            {/*
            상태와 무관하게 모두 상세로 이동할 수 있다.
            수정·취소 가능 여부는 이동한 화면에서 판단해 안내한다.
          */}
            <Link
              href={`/employee/reservations/${reservation.reservationId}`}
              className="hover:border-brand-500 border-line hover:bg-surface-hover block rounded-lg border p-3 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink font-mono text-sm font-bold">
                  {reservation.reservationNo}
                </span>
                <div className="flex items-center gap-2">
                  {reservation.requesterType === 'VISITOR' && (
                    <span className="badge bg-surface-active text-ink-muted">
                      {reservation.companyOrBranchName}
                    </span>
                  )}
                  <StatusBadge status={reservation.displayStatus} />
                </div>
              </div>
              <dl className="text-ink-muted mt-2 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">방문 시간</dt>
                  <dd>{formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">성명</dt>
                  <dd>{reservation.requesterName}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">차량번호</dt>
                  <dd className="font-mono">{reservation.vehicleNo}</dd>
                </div>
                {showSpace && (
                  <div className="flex gap-2">
                    <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">배정 위치</dt>
                    <dd>{reservation.assignedSpaceCode ?? '승인 후 배정'}</dd>
                  </div>
                )}
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/employee/reservations?page=${page - 1}`}
              className="btn btn-secondary min-h-9 px-3 text-xs"
            >
              이전
            </Link>
          )}
          <span className="text-ink-muted text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/employee/reservations?page=${page + 1}`}
              className="btn btn-secondary min-h-9 px-3 text-xs"
            >
              다음
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function ScheduleList({ schedules }: { schedules: RecurringScheduleListItem[] }) {
  if (schedules.length === 0) {
    return <p className="text-ink-faint mt-4 text-sm">반복 예약이 없습니다.</p>;
  }

  return (
    <ul className="mt-3 space-y-3">
      {schedules.map((schedule) => (
        <li key={schedule.scheduleId} className="border-line rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink font-mono text-sm font-bold">{schedule.spaceCode}</span>
            <span className={`badge ${SCHEDULE_STATUS_CLASS[schedule.status]}`}>
              {SCHEDULE_STATUS_LABEL[schedule.status]}
            </span>
          </div>
          <dl className="text-ink-muted mt-2 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">기간</dt>
              <dd>
                {schedule.startDate} ~ {schedule.endDate ?? ''}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">요일</dt>
              <dd>{schedule.weekdaysLabel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">시간대</dt>
              <dd>
                {schedule.dailyStartTime} ~ {schedule.dailyEndTime}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
