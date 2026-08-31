import type { Metadata } from 'next';
import Link from 'next/link';

import { RecurringScheduleForm } from '@/components/admin/recurring-schedule-form';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { listParkingSpaces } from '@/services/parking-space-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '반복 예약 등록' };

export default async function NewRecurringReservationPage() {
  await requireSystemAdminPage('/admin/recurring-reservations');

  const [spaces, settings] = await Promise.all([listParkingSpaces(), getSystemSettings()]);

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/recurring-reservations" className="text-brand-700 text-sm font-semibold">
          ← 반복 예약 관리
        </Link>
        <h1 className="text-ink mt-2 text-xl font-black sm:text-2xl">반복 예약 등록</h1>
        <p className="text-ink-muted mt-1 text-sm">
          등록하면 그 자리에서 기간 내 선택한 요일의 예약이 전부 생성됩니다.
        </p>
      </div>

      <RecurringScheduleForm
        spaces={spaces.map((space) => ({
          spaceId: space.spaceId,
          spaceCode: space.spaceCode,
          areaName: space.area.areaName,
        }))}
        entryExitManagementEnabled={settings.entryExitManagementEnabled}
      />
    </main>
  );
}
