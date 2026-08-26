import { SpaceSection } from '@/components/admin/settings-panel';
import { listParkingAreas, listParkingSpaces } from '@/services/parking-space-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsAreasSpacesPage() {
  const [settings, areas, spaces] = await Promise.all([
    getSystemSettings(),
    listParkingAreas(),
    listParkingSpaces({ includeInactive: true }),
  ]);

  return (
    <SpaceSection
      spaces={spaces}
      areas={areas.map((area) => ({
        ...area,
        mapImageUpdatedAt: area.mapImageUpdatedAt ? area.mapImageUpdatedAt.toISOString() : null,
      }))}
      spaceAssignmentEnabled={settings.spaceAssignmentEnabled}
    />
  );
}
