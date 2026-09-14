import type { Metadata } from 'next';
import Link from 'next/link';

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
        <Link href="/employee" className="text-brand-700 text-sm font-semibold">
          ← 직원 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">법인 차량 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          운행 요청 시간(
          {settings.companyVehicleOperatingStartTime} ~ {settings.companyVehicleOperatingEndTime})
          내에서 1회 최대 {settings.companyVehicleMaxUsageHours}시간까지 신청할 수 있습니다. 어떤
          차량을 배정할지는 관리자가 승인하면서 정합니다.
        </p>
      </div>

      <CompanyVehicleRequestForm
        employeeName={profile?.name ?? session.name}
        minDateTimeInput={earliestSelectableInput(settings.reservationMinLeadMinutes)}
        operatingEndTime={settings.companyVehicleOperatingEndTime}
        maxUsageHours={settings.companyVehicleMaxUsageHours}
      />
    </main>
  );
}
