import type { Metadata } from 'next';

import { CompanyVehicleRequestForm } from '@/components/employee/company-vehicle-request-form';
import { earliestSelectableInput } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인 차량 신청' };

export default async function CompanyVehicleNewTripPage() {
  const session = await requireEmployeePage('/employee/company-vehicle/new');
  const [profile, settings] = await Promise.all([
    getEmployeeProfile(session.employeeUserId),
    getSystemSettings(),
  ]);

  return (
    <main className="app-container space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">법인 차량 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          법인 차량 운행 시간 (
          {settings.companyVehicleOperatingStartTime} ~ {settings.companyVehicleOperatingEndTime})
          내에서, 신청 시점 기준 최소 {settings.reservationMinLeadMinutes}분 이후부터, 1회 최대{' '}
          {settings.companyVehicleMaxUsageHours}시간까지 신청할 수 있습니다.
        </p>
      </div>

      <CompanyVehicleRequestForm
        employeeName={profile?.name ?? session.name}
        minDateTimeInput={earliestSelectableInput(settings.reservationMinLeadMinutes)}
        reservationMinLeadMinutes={settings.reservationMinLeadMinutes}
        operatingStartTime={settings.companyVehicleOperatingStartTime}
        operatingEndTime={settings.companyVehicleOperatingEndTime}
        maxUsageHours={settings.companyVehicleMaxUsageHours}
      />
    </main>
  );
}
