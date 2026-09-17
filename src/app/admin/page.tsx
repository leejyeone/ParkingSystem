import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { DashboardAutoRefresher } from '@/components/admin/dashboard-auto-refresher';
import { ParkingFloorTabs } from '@/components/admin/parking-floor-tabs';
import { ParkingSpaceStatusSection } from '@/components/admin/parking-space-status-section';
import { Alert } from '@/components/ui/alert';
import { requireAdminPage } from '@/lib/admin-page-guard';
import {
  formatKstRange,
  formatKstTime,
  kstWeekdayLabel,
  shiftKstDateString,
  todayKstDateString,
} from '@/lib/datetime';
import { getDashboardData } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '대시보드' };

type PageProps = { searchParams: Promise<{ date?: string; error?: string }> };

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requireAdminPage('/admin');
  const { date: dateParam, error } = await searchParams;

  const today = todayKstDateString();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const dashboard = await getDashboardData(date);
  // "입차 예정" 배지 판정(예정 시간이 지났는데 아직 입차 처리 전인지)에 쓴다.
  const nowMs = dashboard.nowMs;

  const showSpace = dashboard.spaceAssignmentEnabled;
  const showDoubleParking = showSpace && dashboard.doubleParkingEnabled;
  // 도면(주차 평면도)에는 비활성 주차면도 회색으로 표시해야 하지만, 아래 표는 실제 배정 가능한
  // 주차면만 보여주면 되므로 비활성 주차면은 제외한다.
  const activeSpaces = dashboard.spaces.filter((space) => space.isActive);

  return (
    <main className="app-container-wide space-y-4">
      {error === 'forbidden' && (
        <Alert variant="error" title="접근 권한이 없습니다">
          시스템 관리자만 사용할 수 있는 기능입니다.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-black sm:text-2xl">대시보드</h1>
          <p className="text-ink-muted mt-1 text-sm">
             {date} ({kstWeekdayLabel(date)}){' '}
            <DashboardAutoRefresher intervalMinutes={dashboard.dashboardRefreshIntervalMinutes} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className={`btn min-h-10 px-3 py-2 text-xs ${date === today ? 'btn-primary' : 'btn-secondary'}`}
          >
            오늘
          </Link>
          <Link
            href={`/admin?date=${shiftKstDateString(today, 1)}`}
            className={`btn min-h-10 px-3 py-2 text-xs ${
              date === shiftKstDateString(today, 1) ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            내일
          </Link>
          <form method="get" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="input min-h-10 w-40 px-2 py-1.5 text-sm"
              aria-label="조회 날짜"
            />
            <button type="submit" className="btn btn-secondary min-h-10 px-3 py-2 text-xs">
              조회
            </button>
          </form>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showSpace ? (
          <>
            <StatCard
              label="일반 주차 사용"
              value={`${dashboard.normalUsedCount} / ${dashboard.normalTotalCount}`}
              tone="brand"
            />
            {showDoubleParking ? (
              <StatCard
                label="이중주차 사용"
                value={`${dashboard.doubleUsedCount} / ${dashboard.doubleTotalCount}`}
                tone="warning"
              />
            ) : (
              <StatCard
                label="당일 예약 차량"
                value={`${dashboard.dayReservationCount} 대`}
                tone="slate"
              />
            )}
          </>
        ) : (
          <>
            <StatCard
              label="동시 주차 최대"
              value={`${dashboard.peakConcurrentCount} / ${dashboard.parkingCapacity}`}
              tone={
                dashboard.peakConcurrentCount >= dashboard.parkingCapacity ? 'warning' : 'brand'
              }
              hint="당일 시간대별 최대치 / 정원"
            />
            <StatCard
              label="당일 주차 차량"
              value={`${dashboard.dayReservationCount} 대`}
              tone="slate"
              hint="승인 완료 + 입차"
            />
          </>
        )}
        <StatCard
          label="오늘 신규 신청"
          value={`${dashboard.todayNewRequestCount} 건`}
          tone="brand"
          hint="방문 예약 + 법인차량"
        />
        <StatCard
          label="운영시간"
          value={`${dashboard.operatingHours.open} ~ ${dashboard.operatingHours.close}`}
          tone="slate"
        />
      </section>

      {dashboard.failedEmailCount > 0 && (
        <Alert variant="error">
          <Link href="/admin/email-logs?sendStatus=FAILED" className="font-bold hover:underline">
            ⚠ 발송 실패한 이메일이 {dashboard.failedEmailCount}건 있습니다. 눌러서 확인하세요.
          </Link>
        </Alert>
      )}

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">
              방문 예약 승인 대기
              {(dashboard.pendingCount > 0 || dashboard.pendingTotalCount > 0) && (
                <span className="text-ink-faint ml-2 text-xs font-bold">
                  {dashboard.pendingCount}/{dashboard.pendingTotalCount}건
                </span>
              )}
            </h2>
            <Link
              href="/admin/reservations?status=REQUESTED"
              className="text-brand-700 text-sm font-bold"
            >
              전체 보기 →
            </Link>
          </div>

          {dashboard.pendingReservations.length === 0 ? (
            <p className="text-ink-faint mt-4 text-sm">
              이 날짜에는 승인 대기 중인 예약이 없습니다.
              {dashboard.pendingTotalCount > 0 ? (
                <>
                  {' '}
                  다른 날짜에 {dashboard.pendingTotalCount}건이 대기 중입니다.{' '}
                  <Link
                    href="/admin/reservations?status=REQUESTED"
                    className="text-brand-700 font-bold"
                  >
                    전체 보기
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <>
              <p className="field-hint mt-2">행을 누르면 처리 화면으로 이동합니다.</p>
              <div className="table-scroll mt-2">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th className="w-28">방문 시간</th>
                      <th className="w-28">회사명/사업장</th>
                      <th className="w-28">신청자</th>
                      <th className="w-28">차량번호</th>
                      <th>방문 목적</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.pendingReservations.map((reservation) => (
                      <ClickableTableRow
                        key={reservation.reservationId}
                        href={`/admin/reservations/${reservation.reservationId}`}
                      >
                        <td className="whitespace-nowrap">
                          {/* 키보드 이동과 새 탭 열기를 위해 실제 링크를 둔다. */}
                          <Link
                            href={`/admin/reservations/${reservation.reservationId}`}
                            className="text-brand-700 font-bold hover:underline"
                          >
                            {formatKstTime(reservation.visitStartAt)} ~{' '}
                            {formatKstTime(reservation.visitEndAt)}
                          </Link>
                        </td>
                        <td>{reservation.companyOrBranchName}</td>
                        <td>{reservation.requesterName}</td>
                        <td className="font-mono text-xs">{reservation.vehicleNo}</td>
                        <td className="max-w-xs truncate" title={reservation.visitPurpose ?? ''}>
                          {reservation.visitPurpose ?? '-'}
                        </td>
                      </ClickableTableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">
              법인차량 승인 대기
              {(dashboard.companyVehiclePendingCount > 0 ||
                dashboard.companyVehiclePendingTotalCount > 0) && (
                <span className="text-ink-faint ml-2 text-xs font-bold">
                  {dashboard.companyVehiclePendingCount}/{dashboard.companyVehiclePendingTotalCount}
                  건
                </span>
              )}
            </h2>
            <Link
              href="/admin/company-vehicles/trips?status=REQUESTED"
              className="text-brand-700 text-sm font-bold"
            >
              전체 보기 →
            </Link>
          </div>

          {dashboard.companyVehiclePendingTrips.length === 0 ? (
            <p className="text-ink-faint mt-4 text-sm">
              이 날짜에는 승인 대기 중인 법인차량 신청이 없습니다.
              {dashboard.companyVehiclePendingTotalCount > 0 ? (
                <>
                  {' '}
                  다른 날짜에 {dashboard.companyVehiclePendingTotalCount}건이 대기 중입니다.{' '}
                  <Link
                    href="/admin/company-vehicles/trips?status=REQUESTED"
                    className="text-brand-700 font-bold"
                  >
                    전체 보기
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <>
              <p className="field-hint mt-2">행을 누르면 처리 화면으로 이동합니다.</p>
              <div className="table-scroll mt-2">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th className="w-48">운행 시간</th>
                      <th className="w-64">신청 직원</th>
                      <th className="w-28">행선지</th>
                      <th>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.companyVehiclePendingTrips.map((trip) => (
                      <ClickableTableRow
                        key={trip.tripId}
                        href={`/admin/company-vehicles/trips/${trip.tripId}`}
                      >
                        <td className="whitespace-nowrap">
                          {/* 키보드 이동과 새 탭 열기를 위해 실제 링크를 둔다. */}
                          <Link
                            href={`/admin/company-vehicles/trips/${trip.tripId}`}
                            className="text-brand-700 font-bold hover:underline"
                          >
                            {formatKstRange(trip.requestStartAt, trip.requestEndAt)}
                          </Link>
                        </td>
                        <td>
                          {trip.requesterName} ({trip.departmentName})
                        </td>
                        <td>{trip.destination}</td>
                        <td className="truncate" title={trip.reason}>
                          {trip.reason}
                        </td>
                      </ClickableTableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">
              법인차량 반납 대기
              {(dashboard.companyVehicleReturnPendingCount > 0 ||
                dashboard.companyVehicleReturnPendingTotalCount > 0) && (
                <span className="text-ink-faint ml-2 text-xs font-bold">
                  {dashboard.companyVehicleReturnPendingCount}/
                  {dashboard.companyVehicleReturnPendingTotalCount}건
                </span>
              )}
            </h2>
            <Link
              href="/admin/company-vehicles/trips?status=PARKING"
              className="text-brand-700 text-sm font-bold"
            >
              전체 보기 →
            </Link>
          </div>

          {dashboard.companyVehicleReturnPendingTrips.length === 0 ? (
            <p className="text-ink-faint mt-4 text-sm">
              이 날짜에는 반납 확인이 필요한 법인차량이 없습니다.
              {dashboard.companyVehicleReturnPendingTotalCount > 0 ? (
                <>
                  {' '}
                  다른 날짜에 {dashboard.companyVehicleReturnPendingTotalCount}건이 대기 중입니다.{' '}
                  <Link
                    href="/admin/company-vehicles/trips?status=PARKING"
                    className="text-brand-700 font-bold"
                  >
                    전체 보기
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <>
              <p className="field-hint mt-2">
                직원이 반납 처리한 건입니다. 행을 누르면 차량 상태를 확인하고 반납을 확정할 수
                있습니다.
              </p>
              <div className="table-scroll mt-2">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th className="w-44">운행 시간</th>
                      <th className="w-64">신청 직원</th>
                      <th className="w-28">행선지</th>
                      <th>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.companyVehicleReturnPendingTrips.map((trip) => (
                      <ClickableTableRow
                        key={trip.tripId}
                        href={`/admin/company-vehicles/trips/${trip.tripId}`}
                      >
                        <td className="whitespace-nowrap">
                          {/* 키보드 이동과 새 탭 열기를 위해 실제 링크를 둔다. */}
                          <Link
                            href={`/admin/company-vehicles/trips/${trip.tripId}`}
                            className="text-brand-700 font-bold hover:underline"
                          >
                            {formatKstRange(trip.requestStartAt, trip.requestEndAt)}
                          </Link>
                        </td>
                        <td>
                          {trip.requesterName} ({trip.departmentName})
                        </td>
                        <td>{trip.destination}</td>
                        <td className="truncate" title={trip.reason}>
                          {trip.reason}
                        </td>
                      </ClickableTableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      {showSpace && (
        <section className="card">
          <div className="card-body">
            <h2 className="card-title">주차 평면도</h2>
            <p className="field-hint">
              선택한 날짜 기준 현황입니다. 예약이 있는 주차면을 누르면 해당 예약 상세로 이동합니다.
            </p>
            <div className="mt-3">
              <ParkingFloorTabs areas={dashboard.areas} />
            </div>
          </div>
        </section>
      )}

      {showSpace && <ParkingSpaceStatusSection spaces={activeSpaces} nowMs={nowMs} />}
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'warning' | 'amber' | 'slate';
  hint?: string;
}) {
  const toneClass = {
    brand: 'text-brand-700',
    warning: 'text-orange-600',
    amber: 'text-amber-600',
    slate: 'text-ink-muted dark:text-white',
  }[tone];

  return (
    <div className="card">
      <div className="p-4">
        <p className="text-ink-faint text-xs font-bold">{label}</p>
        <p className={`mt-1 text-xl font-black sm:text-2xl ${toneClass}`}>{value}</p>
        {hint ? <p className="text-ink-faint mt-0.5 text-xs font-bold">{hint}</p> : null}
      </div>
    </div>
  );
}
