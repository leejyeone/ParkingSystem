import type { Metadata } from 'next';

import { SpaceSection } from '@/components/admin/settings-panel';
import { listParkingAreas, listParkingSpaces } from '@/services/parking-space-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '구역·주차면' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsAreasSpacesPage() {
  const [settings, areas, spaces] = await Promise.all([
    getSystemSettings(),
    listParkingAreas(),
    listParkingSpaces({ includeInactive: true }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">구역·주차면</h1>
        <p className="mt-1 text-sm text-slate-600">
          주차 구역과 개별 주차면을 등록·수정하고, 도면 이미지를 관리합니다. 변경 내역은 감사 로그에
          기록됩니다.
        </p>
      </div>

      <SpaceSection
        spaces={spaces}
        areas={areas.map((area) => ({
          ...area,
          mapImageUpdatedAt: area.mapImageUpdatedAt ? area.mapImageUpdatedAt.toISOString() : null,
        }))}
        spaceAssignmentEnabled={settings.spaceAssignmentEnabled}
      />
    </div>
  );
}
