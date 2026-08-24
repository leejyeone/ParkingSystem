import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { ParkingMap } from '@/components/parking-map';
import { SpaceTypeBadge } from '@/components/ui/status-badge';
import { Alert } from '@/components/ui/alert';
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
  EMPTY: 'bg-slate-100 text-slate-500',
  RESERVED: 'bg-amber-100 text-amber-800',
  IN_USE: 'bg-emerald-100 text-emerald-800',
};

export const metadata: Metadata = { title: '대시보드' };

type PageProps = { searchParams: Promise<{ date?: string; error?: string }> };

function shiftDate(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requireAdminPage('/admin');
  const { date: dateParam, error } = await searchParams;

  const today = todayKstDateString();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const dashboard = await getDashboardData(date);

  const maxHourlyUsage = Math.max(1, ...dashboard.hourlyUsage.map((slot) => slot.usedCount));
  const showSpace = dashboard.spaceAssignmentEnabled;

  return (
    <main className="app-container-wide space-y-4">
      {error === 'forbidden' && (
        <Alert variant="error" title="접근 권한이 없습니다">
          시스템 관리자만 사용할 수 있는 기능입니다.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">대시보드</h1>
          <p className="mt-1 text-sm text-slate-600">기준일: {date}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className={`btn min-h-10 px-3 py-2 text-xs ${date === today ? 'btn-primary' : 'btn-secondary'}`}
          >
            오늘
          </Link>
          <Link
            href={`/admin?date=${shiftDate(today, 1)}`}
            className={`btn min-h-10 px-3 py-2 text-xs ${
              date === shiftDate(today, 1) ? 'btn-primary' : 'btn-secondary'
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
            <StatCard
              label="이중주차 사용"
              value={`${dashboard.doubleUsedCount} / ${dashboard.doubleTotalCount}`}
              tone="warning"
            />
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
          label="승인 대기"
          value={`${dashboard.pendingCount} 건`}
          tone="amber"
          hint={`전체 ${dashboard.pendingTotalCount} 건`}
        />
        <StatCard
          label="운영시간"
          value={`${dashboard.operatingHours.open} ~ ${dashboard.operatingHours.close}`}
          tone="slate"
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">
              승인 대기 목록
              <span className="ml-2 text-xs font-bold text-slate-500">
                이 날짜 {dashboard.pendingCount}건 / 전체 {dashboard.pendingTotalCount}건
              </span>
            </h2>
            <Link
              href="/admin/reservations?status=REQUESTED"
              className="text-brand-700 text-sm font-bold"
            >
              전체 보기 →
            </Link>
          </div>

          {dashboard.pendingReservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
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
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>방문 시간</th>
                      <th>방문 상호/지사</th>
                      <th>신청자</th>
                      <th>차량번호</th>
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
          <h2 className="card-title">시간대별 예약 현황</h2>
          <p className="field-hint">승인 완료 및 입차 상태 예약 기준입니다.</p>
          {/*
            막대 수는 운영시간에 따라 달라지므로(예: 07~22시면 15개) 고정 폭 대신
            남는 가로를 균등하게 나눠 갖게 한다. minmax(0, 1fr) 이라야 좁은 화면에서
            내용 폭에 밀려 넘치지 않는다.
          */}
          <div
            className="mt-4 grid items-end gap-x-0.5 sm:gap-x-1"
            style={{
              gridTemplateColumns: `repeat(${dashboard.hourlyUsage.length}, minmax(0, 1fr))`,
            }}
          >
            {dashboard.hourlyUsage.map((slot) => (
              <div key={slot.hour} className="flex min-w-0 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                  {slot.usedCount}
                </span>
                <div
                  className="bg-brand-500 w-full rounded-t"
                  style={{ height: `${Math.max(4, (slot.usedCount / maxHourlyUsage) * 96)}px` }}
                  aria-hidden
                />
                {/* 좁은 화면에서는 "시" 를 빼야 숫자가 겹치지 않는다. */}
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {slot.hour}
                  <span className="hidden sm:inline">시</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showSpace && (
        <section className="card">
          <div className="card-body">
            <h2 className="card-title">주차면 현황</h2>
            <p className="field-hint">
              주차면 배정은 예약 상세 화면의 선택 목록에서 수행합니다. 도면 위 클릭 배정은 제공하지
              않습니다.
            </p>

            <div className="table-scroll mt-3">
              {/*
                table-fixed 로 두는 이유.

                기본값인 auto 레이아웃에서 `width` 는 강제가 아니라 선호값이다. 표가 내용보다
                넓으면 브라우저가 재량껏 열을 늘리는데, 그 방식이 엔진마다 달라 Safari 에서는
                폭을 지정한 유형 열까지 같이 늘어났다.
                fixed 레이아웃은 첫 행에 지정한 폭을 그대로 따르므로 엔진이 달라도 같아진다.

                주차면·유형은 내용이 짧아 고정 폭(`B1-01`, `사용불가` 기준)으로 두고,
                남는 폭은 정보가 많은 상태·상세가 절반씩 나눠 갖는다.
              */}
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
                  {dashboard.spaces.map((space) => (
                    <tr key={space.spaceId}>
                      <td className="font-mono font-bold">{space.spaceCode}</td>
                      <td>
                        <SpaceTypeBadge spaceType={space.spaceType} />
                      </td>
                      {/*
                        상태 열과 상세 열은 같은 예약 목록을 행 단위로 나란히 보여준다.
                        (상태 = 예약된 시간, 상세 = 그 예약의 차량번호)
                      */}
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
                                {/* 시간도 상세 열의 차량번호와 같은 예약으로 이동한다. */}
                                <Link
                                  href={`/admin/reservations/${occupancy.reservationId}`}
                                  className="text-brand-700 font-bold hover:underline"
                                >
                                  {formatKstTime(occupancy.visitStartAt)} ~{' '}
                                  {formatKstTime(occupancy.visitEndAt)}
                                </Link>
                                {space.inUseReservationId === occupancy.reservationId && (
                                  <span className={`badge ${SPACE_STATUS_CLASS.IN_USE}`}>
                                    {SPACE_STATUS_LABEL.IN_USE}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        {space.occupancies.length === 0 ? (
                          <span className="text-xs text-slate-400">-</span>
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
      )}

      {showSpace && (
        <section className="card">
          <div className="card-body">
            <h2 className="card-title">주차 평면도</h2>
            <p className="field-hint">
              선택한 날짜 기준 현황입니다. 예약이 있는 주차면을 누르면 해당 예약 상세로 이동합니다.
            </p>
            <div className="mt-3">
              <ParkingMap spaces={dashboard.spaces} />
            </div>
          </div>
        </section>
      )}
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
    slate: 'text-slate-700',
  }[tone];

  return (
    <div className="card">
      <div className="p-4">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-black sm:text-2xl ${toneClass}`}>{value}</p>
        {hint ? <p className="mt-0.5 text-xs font-bold text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
