import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ReservationForm,
  type ReservationFormInitialValues,
} from '@/components/reservation/reservation-form';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '내 방문 신청' };

export default async function EmployeeNewReservationPage() {
  const session = await requireEmployeePage('/employee/reservations/new');
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);
  const profile = await getEmployeeProfile(session.employeeUserId);

  const initialValues: ReservationFormInitialValues | undefined = profile
    ? {
        requesterName: profile.name,
        requesterEmail: profile.email,
        vehicleNo: profile.vehicleNo ?? '',
      }
    : undefined;

  return (
    <main className="app-container pb-4">
      <div className="mb-4">
        <Link href="/employee" className="text-brand-700 text-sm font-semibold">
          ← 직원 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">내 방문 신청</h1>
        <p className="mt-1 text-sm text-slate-600">표시된 항목(*)은 필수입니다.</p>
      </div>

      <ReservationForm
        mode="employee-self"
        autofilled={Boolean(profile)}
        initialValues={initialValues}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          parkingOpenTime: settings.parkingOpenTime,
          parkingCloseTime: settings.parkingCloseTime,
          maxReservationHours: settings.maxReservationHours,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
          minDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes,
            settings.appTimeZone,
          ),
        }}
      />
    </main>
  );
}
