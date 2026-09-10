import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardAutoRefresher } from '@/components/admin/dashboard-auto-refresher';
import { LiveClock } from '@/components/admin/live-clock';
import { MaximizableCard } from '@/components/admin/maximizable-card';
import { ParkingFloorTabs } from '@/components/admin/parking-floor-tabs';
import { SpaceTypeBadge } from '@/components/ui/status-badge';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstTime, todayKstDateString } from '@/lib/datetime';
import { getDashboardData, type SpaceOccupancyStatus } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

const SPACE_STATUS_LABEL: Record<SpaceOccupancyStatus, string> = {
  EMPTY: '비어 있음',
  RESERVED: '예약',
  IN_USE: '사용 중',
};

const SPACE_STATUS_CLASS: Record<SpaceOccupancyStatus, string> = {
  EMPTY: 'bg-surface-hover text-ink-faint',
  RESERVED: 'bg-amber-100 text-amber-800',
  IN_USE: 'bg-emerald-100 text-emerald-800',
};

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

  const nowMs = dashboard.nowMs;
  const activeSpaces = dashboard.spaces.filter((space) => space.isActive);

  return (
    <main className="app-container-wide space-y-4">
      <MaximizableCard header={<LiveClock />}>
        {/* 실제로 보여줄 시각은 위 실시간 시계가 대신하고, 이 컴포넌트는 설정된 주기마다
            router.refresh() 를 호출하는 역할만 조용히 수행한다. */}
        <span className="hidden">
          <DashboardAutoRefresher intervalMinutes={dashboard.dashboardRefreshIntervalMinutes} />
        </span>
        <ParkingFloorTabs areas={dashboard.areas} />
      </MaximizableCard>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">
            주차면 현황
            <span className="text-ink-faint ml-2 text-xs font-bold">
              {activeSpaces.filter((space) => space.status === 'IN_USE').length}면 사용 중
            </span>
          </h2>
          <p className="field-hint">입차 예정: 입차 처리 미완료, 사용 중: 입차 처리 완료</p>

          <div className="table-scroll mt-3">
            <table className="data-table table-fixed">
              <thead>
                <tr>
                  <th className="w-24">주차면</th>
                  <th className="w-24">유형</th>
                  <th className="w-1/2">상태</th>
                  <th className="w-1/2">상세</th>
                </tr>
              </thead>
              <tbody>
                {activeSpaces.map((space) => (
                  <tr key={space.spaceId}>
                    <td className="font-mono font-bold">{space.spaceCode}</td>
                    <td>
                      <SpaceTypeBadge spaceType={space.spaceType} />
                    </td>
                    <td>
                      {space.occupancies.length === 0 ? (
                        <span className={`badge ${SPACE_STATUS_CLASS.EMPTY}`}>
                          {SPACE_STATUS_LABEL.EMPTY}
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {space.occupancies.map((occupancy) => (
                            <li
                              key={occupancy.reservationId}
                              className="flex items-center gap-2 text-xs whitespace-nowrap"
                            >
                              <Link
                                href={`/admin/reservations/${occupancy.reservationId}`}
                                className="text-brand-700 font-bold hover:underline"
                              >
                                {formatKstTime(occupancy.visitStartAt)} ~{' '}
                                {formatKstTime(occupancy.visitEndAt)}
                              </Link>
                              {space.inUseReservationId === occupancy.reservationId ? (
                                <span className={`badge ${SPACE_STATUS_CLASS.IN_USE}`}>
                                  {SPACE_STATUS_LABEL.IN_USE}
                                </span>
                              ) : (
                                occupancy.reservationStatus === 'APPROVED' &&
                                occupancy.visitStartAt.getTime() <= nowMs && (
                                  <span className="badge bg-amber-100 text-amber-800">
                                    입차 예정
                                  </span>
                                )
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      {space.occupancies.length === 0 ? (
                        <span className="text-ink-faint text-xs">-</span>
                      ) : (
                        <ul className="space-y-1">
                          {space.occupancies.map((occupancy) => (
                            <li key={occupancy.reservationId} className="text-xs">
                              <Link
                                href={`/admin/reservations/${occupancy.reservationId}`}
                                className="text-brand-700 font-mono font-bold hover:underline"
                              >
                                {occupancy.vehicleNo}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
