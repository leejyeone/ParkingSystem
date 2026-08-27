import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RecurringScheduleEditForm } from '@/components/admin/recurring-schedule-edit-form';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { parseNumericId } from '@/lib/api-helpers';
import { getRecurringScheduleDetail } from '@/services/recurring-reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 수정' };

type PageProps = { params: Promise<{ id: string }> };

export default async function RecurringReservationEditPage({ params }: PageProps) {
  await requireAdminPage('/admin/recurring-reservations');

  const { id } = await params;
  const scheduleId = parseNumericId(id, '반복 예약 일정 ID');
  const { schedule } = await getRecurringScheduleDetail(scheduleId);

  if (schedule.status !== 'ACTIVE') {
    notFound();
  }

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link
          href={`/admin/recurring-reservations/${scheduleId}`}
          className="text-brand-700 text-sm font-semibold"
        >
          ← 반복 예약 상세
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
          {schedule.employeeName} ({schedule.departmentName}) 반복 예약 수정
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {schedule.spaceCode} 주차면 배정의 요일·시간·기간을 변경합니다. 저장하면 아직 방문 전인
          예정 일정이 새 패턴으로 다시 생성됩니다.
        </p>
      </div>

      <RecurringScheduleEditForm
        scheduleId={scheduleId}
        initial={{
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          weekdaysMask: schedule.weekdaysMask,
          dailyStartTime: schedule.dailyStartTime,
          dailyEndTime: schedule.dailyEndTime,
          skipApproval: schedule.skipApproval,
          skipEmail: schedule.skipEmail,
        }}
      />
    </main>
  );
}
