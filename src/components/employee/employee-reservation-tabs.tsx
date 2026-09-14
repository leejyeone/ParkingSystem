import type { RecurringScheduleListItem } from '@/services/recurring-reservation-service';

const SCHEDULE_STATUS_LABEL = { ACTIVE: '진행 중', CANCELLED: '취소됨' } as const;
const SCHEDULE_STATUS_CLASS = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-surface-active text-ink-muted',
} as const;

/**
 * 직원 "반복 예약" 요약 목록 — 시리즈당 한 줄(주차면·기간·요일·시간대·상태)만 보여준다.
 * 개별 방문/법인차량 신청은 "예약 조회" 통합 목록(employee-activity-service)에서 다룬다.
 */
export function EmployeeRecurringScheduleList({
  schedules,
}: {
  schedules: RecurringScheduleListItem[];
}) {
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
