import type { Metadata } from 'next';

import { ReservationForm } from '@/components/reservation/reservation-form';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '방문객 대리 신청' };

export default async function EmployeeProxyReservationPage() {
  const session = await requireEmployeePage('/employee/reservations/proxy');
  const [profile, settings] = await Promise.all([
    getEmployeeProfile(session.employeeUserId),
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
  ]);
  // 검색해서 고른 담당자와 같은 형태("이름 (부서)")로 보여야 기본값도 선택된 상태로 구분된다.
  const defaultHostLabel = profile?.departmentName
    ? `${session.name} (${profile.departmentName})`
    : session.name;

  return (
    <main className="app-container pb-4">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">방문객 대리 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          담당자: {session.name} ({session.email})
        </p>
      </div>

      <ReservationForm
        mode="employee-proxy"
        initialValues={{
          hostEmployee: { employeeUserId: session.employeeUserId, label: defaultHostLabel },
        }}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          parkingOpenTime: settings.parkingOpenTime,
          parkingCloseTime: settings.parkingCloseTime,
          maxReservationHours: settings.maxReservationHours,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
          personalDataRetentionDays: settings.personalDataRetentionDays,
          timingExceptionEnabled: settings.timingExceptionEnabled,
          minDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes,
            settings.appTimeZone,
          ),
          defaultDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes + 1,
            settings.appTimeZone,
          ),
        }}
      />
    </main>
  );
}
