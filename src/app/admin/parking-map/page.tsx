import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DashboardAutoRefresher } from '@/components/admin/dashboard-auto-refresher';
import { LiveClock } from '@/components/admin/live-clock';
import { MaximizableCard } from '@/components/admin/maximizable-card';
import { ParkingFloorTabs } from '@/components/admin/parking-floor-tabs';
import { ParkingSpaceStatusSection } from '@/components/admin/parking-space-status-section';
import { PendingApprovalBadge } from '@/components/admin/pending-approval-badge';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { todayKstDateString } from '@/lib/datetime';
import { getDashboardData } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '주차 평면도' };

/**
 * 다른 모니터에 상시 띄워 두는 용도의 화면 — 오늘 날짜 기준 주차 평면도 + 주차면 현황
 * 표만 보여준다. 승인·입출차 처리로 현황이 바뀌므로 대시보드와 같은 주기로 자동
 * 새로고침한다(화면엔 갱신 문구 대신 실시간 시계만 보여준다). 날짜를 고를 필요가 없어
 * 대시보드에 있던 날짜 이동 UI는 두지 않는다.
 */
export default async function AdminParkingMapPage() {
  await requireAdminPage('/admin/parking-map');

  const today = todayKstDateString();
  const dashboard = await getDashboardData(today);

  if (!dashboard.spaceAssignmentEnabled) {
    redirect('/admin');
  }

  const activeSpaces = dashboard.spaces.filter((space) => space.isActive);
  const pendingCount =
    dashboard.pendingTotalCount +
    dashboard.companyVehiclePendingCount +
    dashboard.companyVehicleReturnPendingCount;

  return (
    <main className="app-container-wide space-y-4">
      <MaximizableCard
        header={
          <span className="flex items-center gap-3">
            <LiveClock />
            <PendingApprovalBadge count={pendingCount} />
          </span>
        }
      >
        {/* 실제로 보여줄 시각은 위 실시간 시계가 대신하고, 이 컴포넌트는 설정된 주기마다
            router.refresh() 를 호출하는 역할만 조용히 수행한다. */}
        <span className="hidden">
          <DashboardAutoRefresher intervalMinutes={dashboard.dashboardRefreshIntervalMinutes} />
        </span>
        <ParkingFloorTabs areas={dashboard.areas} />
      </MaximizableCard>

      <ParkingSpaceStatusSection spaces={activeSpaces} nowMs={dashboard.nowMs} />
    </main>
  );
}
