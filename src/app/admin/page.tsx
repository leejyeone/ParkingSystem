import type { Metadata } from 'next';
import Link from 'next/link';

import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import { Alert } from '@/components/ui/alert';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstTime, todayKstDateString } from '@/lib/datetime';
import { getDashboardData } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

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
          <p className="mt-1 text-sm text-slate-600">기준일: {date} (Asia/Seoul)</p>
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
        <StatCard label="승인 대기" value={`${dashboard.pendingCount} 건`} tone="amber" />
        <StatCard
          label="운영시간"
          value={`${dashboard.operatingHours.open} ~ ${dashboard.operatingHours.close}`}
          tone="slate"
        />
      </section>

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">승인 대기 목록</h2>
            <Link
              href="/admin/reservations?status=REQUESTED"
              className="text-brand-700 text-sm font-bold"
            >
              전체 보기 →
            </Link>
          </div>

          {dashboard.pendingReservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">승인 대기 중인 예약이 없습니다.</p>
          ) : (
            <div className="table-scroll mt-3">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>예약번호</th>
                    <th>구분</th>
                    <th>방문 상호/지사</th>
                    <th>신청자</th>
                    <th>차량번호</th>
                    <th>방문 시간</th>
                    <th>추천 위치</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.pendingReservations.map((reservation) => (
                    <tr key={reservation.reservationId}>
                      <td className="font-mono text-xs">{reservation.reservationNo}</td>
                      <td>{REQUESTER_TYPE_LABEL[reservation.requesterType]}</td>
                      <td>{reservation.companyOrBranchName}</td>
                      <td>{reservation.requesterName}</td>
                      <td className="font-mono text-xs">{reservation.vehicleNo}</td>
                      <td className="whitespace-nowrap">
                        {formatKstTime(reservation.visitStartAt)} ~{' '}
                        {formatKstTime(reservation.visitEndAt)}
                      </td>
                      <td>{reservation.recommendedSpaceCode ?? '추천 없음'}</td>
                      <td>
                        <Link
                          href={`/admin/reservations/${reservation.reservationId}`}
                          className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                        >
                          처리
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">시간대별 예약 현황</h2>
          <p className="field-hint">승인 완료 및 입차 상태 예약 기준입니다.</p>
          <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-2">
            {dashboard.hourlyUsage.map((slot) => (
              <div key={slot.hour} className="flex w-9 shrink-0 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500">{slot.usedCount}</span>
                <div
                  className="bg-brand-500 w-full rounded-t"
                  style={{ height: `${Math.max(4, (slot.usedCount / maxHourlyUsage) * 96)}px` }}
                  aria-hidden
                />
                <span className="text-[10px] text-slate-500">{slot.hour}시</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">주차면 현황</h2>
          <p className="field-hint">
            주차면 배정은 예약 상세 화면의 선택 목록에서 수행합니다. 도면 위 클릭 배정은 제공하지
            않습니다.
          </p>

          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>주차면</th>
                  <th>유형</th>
                  <th>구역</th>
                  <th>상태</th>
                  <th>당일 예약</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.spaces.map((space) => (
                  <tr key={space.spaceId}>
                    <td className="font-mono font-bold">{space.spaceCode}</td>
                    <td>
                      <SpaceTypeBadge spaceType={space.spaceType} />
                    </td>
                    <td className="text-xs text-slate-500">{space.areaName}</td>
                    <td>
                      {space.occupancies.length > 0 ? (
                        <span className="badge bg-emerald-100 text-emerald-800">사용</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-500">비어 있음</span>
                      )}
                    </td>
                    <td>
                      {space.occupancies.length === 0 ? (
                        <span className="text-xs text-slate-400">-</span>
                      ) : (
                        <ul className="space-y-1">
                          {space.occupancies.map((occupancy) => (
                            <li
                              key={occupancy.reservationId}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <StatusBadge status={occupancy.reservationStatus} />
                              <span className="font-mono text-xs">{occupancy.vehicleNo}</span>
                              <span className="text-xs text-slate-500">
                                {formatKstTime(occupancy.visitStartAt)} ~{' '}
                                {formatKstTime(occupancy.visitEndAt)}
                              </span>
                              <Link
                                href={`/admin/reservations/${occupancy.reservationId}`}
                                className="text-brand-700 text-xs font-bold"
                              >
                                상세
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

      {dashboard.mapImageUrls.length > 0 && (
        <section className="card">
          <div className="card-body">
            <h2 className="card-title">주차장 도면 (참고용)</h2>
            <p className="field-hint">
              도면은 위치 확인용 참고 이미지입니다. 주차면 배정은 주차면 코드로만 처리됩니다.
            </p>
            <div className="mt-3 space-y-4">
              {dashboard.mapImageUrls.map((area) => (
                <figure key={area.areaName}>
                  <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {/* 도면은 관리자가 임의 URL 로 등록할 수 있는 참고용 이미지이므로
                        next/image 최적화 대상에서 제외하고 일반 img 를 사용한다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={area.mapImageUrl}
                      alt={`${area.areaName} 참고용 도면`}
                      className="h-auto w-full object-contain"
                    />
                  </div>
                  <figcaption className="mt-1 text-xs text-slate-500">{area.areaName}</figcaption>
                </figure>
              ))}
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
}: {
  label: string;
  value: string;
  tone: 'brand' | 'warning' | 'amber' | 'slate';
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
      </div>
    </div>
  );
}
