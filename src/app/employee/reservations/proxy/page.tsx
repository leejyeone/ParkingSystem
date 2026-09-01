import type { Metadata } from 'next';
import Link from 'next/link';

import { ReservationForm } from '@/components/reservation/reservation-form';
import { Alert } from '@/components/ui/alert';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '방문객 대리 신청' };

export default async function EmployeeProxyReservationPage() {
  const session = await requireEmployeePage('/employee/reservations/proxy');
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);

  return (
    <main className="app-container pb-4">
      <div className="mb-4">
        <Link href="/employee" className="text-brand-700 text-sm font-semibold">
          ← 직원 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">방문객 대리 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          담당자: {session.name} ({session.email})
        </p>
      </div>

      <div className="mb-4">
        <Alert variant="info" title="방문객 개인정보 동의 확인이 필요합니다">
          방문객에게 개인정보 수집·이용 목적을 안내하고 동의를 확인한 뒤 신청해 주세요.
        </Alert>
      </div>

      <ReservationForm
        mode="employee-proxy"
        initialValues={{
          hostEmployee: { employeeUserId: session.employeeUserId, label: session.name },
        }}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          parkingOpenTime: settings.parkingOpenTime,
          parkingCloseTime: settings.parkingCloseTime,
          maxReservationHours: settings.maxReservationHours,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
          personalDataRetentionDays: settings.personalDataRetentionDays,
          minDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes,
            settings.appTimeZone,
          ),
        }}
      />
    </main>
  );
}
