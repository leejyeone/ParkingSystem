import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { StatusBadge } from '@/components/ui/status-badge';
import { parseNumericId } from '@/lib/api-helpers';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { formatKstRange } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { getRecurringScheduleDetail } from '@/services/recurring-reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 상세' };

const STATUS_LABEL = { ACTIVE: '진행 중', CANCELLED: '취소됨' } as const;

type PageProps = { params: Promise<{ id: string }> };

/**
 * 직원 본인의 반복 예약 상세 — "반복 예약" 탭의 카드를 누르면 들어온다.
 * 이 시리즈로 생성된 개별 예약(occurrence)을 최신 방문 일정이 위로 오도록 보여준다.
 * 읽기 전용이다(수정·제외 처리는 관리자 전용으로 남겨 둔다).
 */
export default async function EmployeeRecurringScheduleDetailPage({ params }: PageProps) {
  const session = await requireEmployeePage('/employee/reservations');
  const { id } = await params;

  let scheduleId: number;
  try {
    scheduleId = parseNumericId(id, '반복 예약 일정 ID');
  } catch {
    notFound();
  }

  let schedule, occurrences;
  try {
    ({ schedule, occurrences } = await getRecurringScheduleDetail(scheduleId));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  // 남의 반복 예약 ID 를 넣은 경우도 "없음"으로 동일하게 처리한다.
  if (schedule.employeeUserId !== session.employeeUserId) {
    notFound();
  }

  // getRecurringScheduleDetail 는 방문 시작 오름차순으로 내려주는데, 이 화면은 최신
  // 일정이 위로 오도록(다른 탭과 같은 정렬 방향) 보여준다 — 이미 정렬된 배열을 뒤집기만
  // 하면 되므로 다시 정렬할 필요는 없다.
  const sortedOccurrences = [...occurrences].reverse();

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link
          href="/employee/reservations?kind=RECURRING"
          className="text-brand-700 text-sm font-semibold"
        >
          ← 예약 조회
        </Link>
        <h1 className="text-ink mt-2 text-xl font-black sm:text-2xl">반복 예약 상세</h1>
      </div>

      <section className="card">
        <div className="card-body">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="definition-row">
              <dt className="definition-term">주차면</dt>
              <dd className="definition-desc font-mono">{schedule.spaceCode}</dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">기간</dt>
              <dd className="definition-desc">
                {schedule.startDate} ~ {schedule.endDate ?? ''}
              </dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">반복 요일</dt>
              <dd className="definition-desc">{schedule.weekdaysLabel}</dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">매일 시간대</dt>
              <dd className="definition-desc">
                {schedule.dailyStartTime} ~ {schedule.dailyEndTime}
              </dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">상태</dt>
              <dd className="definition-desc">{STATUS_LABEL[schedule.status]}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">개별 예약</h2>
          <p className="field-hint">
            이 반복 일정으로 생성된 개별 방문 예약입니다. 관리자가 내용을 수정·제외 처리하면 바로
            반영됩니다.
          </p>

          {sortedOccurrences.length === 0 ? (
            <p className="text-ink-faint mt-4 text-sm">생성된 예약이 없습니다.</p>
          ) : (
            <div className="table-scroll mt-3">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>예약번호</th>
                    <th>방문 일정</th>
                    <th>주차 위치</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOccurrences.map((occurrence) => {
                    const detailHref = `/employee/reservations/${occurrence.reservationId}`;
                    return (
                      <ClickableTableRow key={occurrence.reservationId} href={detailHref}>
                        <td className="font-mono text-xs">
                          <Link href={detailHref} className="text-brand-700 hover:underline">
                            {occurrence.reservationNo}
                          </Link>
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {formatKstRange(occurrence.visitStartAt, occurrence.visitEndAt)}
                        </td>
                        <td className="font-mono text-xs">{occurrence.assignedSpaceCode ?? '-'}</td>
                        <td>
                          <StatusBadge status={occurrence.displayStatus} />
                        </td>
                      </ClickableTableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
