import type { Metadata } from 'next';
import Link from 'next/link';

import { RecurringScheduleOccurrenceTable } from '@/components/admin/recurring-schedule-occurrence-table';
import { parseNumericId } from '@/lib/api-helpers';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { getRecurringScheduleDetail } from '@/services/recurring-reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 상세' };

const STATUS_LABEL = { ACTIVE: '진행 중', CANCELLED: '취소됨' } as const;

type PageProps = { params: Promise<{ id: string }> };

export default async function RecurringReservationDetailPage({ params }: PageProps) {
  await requireAdminPage('/admin/recurring-reservations');

  const { id } = await params;
  const scheduleId = parseNumericId(id, '반복 예약 일정 ID');
  const { schedule, occurrences } = await getRecurringScheduleDetail(scheduleId);

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/recurring-reservations" className="text-brand-700 text-sm font-semibold">
          ← 반복 예약 관리
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
            {schedule.employeeName} ({schedule.departmentName}) 반복 예약
          </h1>
          {schedule.status === 'ACTIVE' && (
            <Link
              href={`/admin/recurring-reservations/${schedule.scheduleId}/edit`}
              className="btn btn-secondary min-h-9 px-3 text-xs"
            >
              반복 일정 수정
            </Link>
          )}
        </div>
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
                {schedule.startDate} ~ {schedule.endDate}
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
              <dt className="definition-term">승인 절차</dt>
              <dd className="definition-desc">
                {schedule.skipApproval ? '생략(자동 승인)' : '사용'}
              </dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">개별 알림 메일</dt>
              <dd className="definition-desc">{schedule.skipEmail ? '생략' : '발송'}</dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">상태</dt>
              <dd className="definition-desc">{STATUS_LABEL[schedule.status]}</dd>
            </div>
            <div className="definition-row">
              <dt className="definition-term">건수</dt>
              <dd className="definition-desc">
                진행 {schedule.activeOccurrenceCount}건 / 전체 {schedule.occurrenceCount}건
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <RecurringScheduleOccurrenceTable
        scheduleId={schedule.scheduleId}
        scheduleActive={schedule.status === 'ACTIVE'}
        occurrences={occurrences.map((occurrence) => ({
          reservationId: occurrence.reservationId,
          reservationNo: occurrence.reservationNo,
          visitStartAt: occurrence.visitStartAt.toISOString(),
          visitEndAt: occurrence.visitEndAt.toISOString(),
          displayStatus: occurrence.displayStatus,
          reservationStatus: occurrence.reservationStatus,
        }))}
      />
    </main>
  );
}
