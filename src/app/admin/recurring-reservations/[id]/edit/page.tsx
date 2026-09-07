import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RecurringScheduleEditForm } from '@/components/admin/recurring-schedule-edit-form';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { parseNumericId } from '@/lib/api-helpers';
import { getRecurringScheduleDetail } from '@/services/recurring-reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 수정' };

type PageProps = { params: Promise<{ id: string }> };

export default async function RecurringReservationEditPage({ params }: PageProps) {
  await requireSystemAdminPage('/admin/recurring-reservations');

  const { id } = await params;
  const scheduleId = parseNumericId(id, '반복 예약 일정 ID');
  const [{ schedule }, settings] = await Promise.all([
    getRecurringScheduleDetail(scheduleId),
    getSystemSettings(),
  ]);

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
        <h1 className="text-ink mt-2 text-xl font-black sm:text-2xl">
          {schedule.employeeName} ({schedule.departmentName}) 반복 예약 수정
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {schedule.spaceCode} 주차면 배정의 요일·시간·기간을 변경합니다. 새 일정에 그대로 남는
          날짜는 손대지 않고, 더 이상 해당하지 않는 날짜만 정리한 뒤 필요한 날짜만 새로 생성합니다.
          종료일은 시작일로부터 최대 1개월(31일) 이내로 입력해야 합니다.
        </p>
      </div>

      <RecurringScheduleEditForm
        scheduleId={scheduleId}
        initial={{
          startDate: schedule.startDate,
          endDate: schedule.endDate ?? '',
          weekdaysMask: schedule.weekdaysMask,
          dailyStartTime: schedule.dailyStartTime,
          dailyEndTime: schedule.dailyEndTime,
          approvalEnabled: schedule.approvalEnabled,
          autoEntryExitEnabled: schedule.autoEntryExitEnabled,
          hiddenFromReservationList: schedule.hiddenFromReservationList,
        }}
        entryExitManagementEnabled={settings.entryExitManagementEnabled}
      />
    </main>
  );
}
