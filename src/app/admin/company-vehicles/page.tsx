import type { Metadata } from 'next';
import Link from 'next/link';

import { CompanyVehicleSection } from '@/components/admin/company-vehicle-section';
import { CompanyVehicleSettingsForm } from '@/components/admin/company-vehicle-settings-form';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { listParkingSpaces } from '@/services/parking-space-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인차량 관리' };

export default async function CompanyVehiclesPage() {
  await requireAdminPage('/admin/company-vehicles');

  const [vehicles, spaces, settings] = await Promise.all([
    listCompanyVehicles({ includeInactive: true }),
    listParkingSpaces(),
    getSystemSettings(),
  ]);

  return (
    <main className="app-container-wide space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-black sm:text-2xl">법인차량 관리</h1>
          <p className="text-ink-muted mt-1 text-sm">
            법인 공용 차량의 기본 정보(차량번호·메모·주차 위치)와 운행 정책(신청 가능
            시간대·최대 사용시간)을 함께 관리합니다. 주차 위치를 지정하면 모든 주차
            평면도에서 다른 색으로 표시되고, 방문 예약 배정 후보에서 제외됩니다.
          </p>
        </div>
        <Link href="/admin/company-vehicles/trips" className="btn btn-secondary">
          법인차량 신청내역
        </Link>
      </div>

      <CompanyVehicleSettingsForm initialSettings={settings} />

      <CompanyVehicleSection
        vehicles={vehicles}
        spaces={spaces.map((space) => ({
          spaceId: space.spaceId,
          spaceCode: space.spaceCode,
          areaName: space.area.areaName,
        }))}
      />
    </main>
  );
}
