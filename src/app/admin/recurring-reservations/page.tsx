import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { listRecurringSchedules } from '@/services/recurring-reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 관리' };

const STATUS_LABEL = { ACTIVE: '진행 중', CANCELLED: '취소됨' } as const;
const STATUS_CLASS = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-surface-active text-ink-muted',
} as const;

export default async function RecurringReservationsPage() {
  await requireSystemAdminPage('/admin/recurring-reservations');

  const schedules = await listRecurringSchedules();

  return (
    <main className="app-container-wide space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-black sm:text-2xl">반복 예약 관리</h1>
          <p className="text-ink-muted mt-1 text-sm">
            관리자가 특정 직원에게 특정 주차면을 기간·요일·시간대로 미리 배정합니다.
          </p>
        </div>
        <Link href="/admin/recurring-reservations/new" className="btn btn-primary">
          + 반복 예약 등록
        </Link>
      </div>

      <section className="card">
        <div className="card-body">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>대상 직원</th>
                  <th>주차면</th>
                  <th>기간</th>
                  <th>요일</th>
                  <th>시간대</th>
                  <th>관리자 승인</th>
                  <th>입출차 자동</th>
                  <th>목록 숨김</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-ink-faint text-center text-sm">
                      등록된 반복 예약이 없습니다.
                    </td>
                  </tr>
                ) : (
                  schedules.map((schedule) => (
                    <ClickableTableRow
                      key={schedule.scheduleId}
                      href={`/admin/recurring-reservations/${schedule.scheduleId}`}
                    >
                      <td>
                        <Link
                          href={`/admin/recurring-reservations/${schedule.scheduleId}`}
                          className="text-brand-700 font-bold hover:underline"
                        >
                          {schedule.employeeName} ({schedule.departmentName})
                        </Link>
                      </td>
                      <td className="font-mono text-xs">{schedule.spaceCode}</td>
                      <td className="text-xs whitespace-nowrap">
                        {schedule.startDate} ~ {schedule.endDate ?? ''}
                      </td>
                      <td className="text-xs">{schedule.weekdaysLabel}</td>
                      <td className="text-xs whitespace-nowrap">
                        {schedule.dailyStartTime} ~ {schedule.dailyEndTime}
                      </td>
                      <td>{schedule.approvalEnabled ? 'O' : 'X'}</td>
                      <td>{schedule.autoEntryExitEnabled ? 'O' : 'X'}</td>
                      <td>{schedule.hiddenFromReservationList ? 'O' : 'X'}</td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[schedule.status]}`}>
                          {STATUS_LABEL[schedule.status]}
                        </span>
                      </td>
                    </ClickableTableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
