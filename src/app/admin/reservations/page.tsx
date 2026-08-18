import { ReservationStatus, RequesterType } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL, RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, kstDayRangeUtc } from '@/lib/datetime';
import { listReservationsForAdmin } from '@/services/reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '예약 목록' };

type PageProps = {
  searchParams: Promise<{
    date?: string;
    status?: string;
    requesterType?: string;
    vehicleNo?: string;
    requesterName?: string;
    spaceCode?: string;
    page?: string;
  }>;
};

export default async function AdminReservationListPage({ searchParams }: PageProps) {
  await requireAdminPage('/admin/reservations');
  const params = await searchParams;

  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const range = date ? kstDayRangeUtc(date) : null;
  const status =
    params.status && params.status in ReservationStatus
      ? (params.status as ReservationStatus)
      : undefined;
  const requesterType =
    params.requesterType && params.requesterType in RequesterType
      ? (params.requesterType as RequesterType)
      : undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const result = await listReservationsForAdmin({
    dateFrom: range?.start,
    dateTo: range?.end,
    status,
    requesterType,
    vehicleNo: params.vehicleNo || undefined,
    requesterName: params.requesterName || undefined,
    spaceCode: params.spaceCode || undefined,
    page,
    pageSize: 20,
  });

  const buildPageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (date) query.set('date', date);
    if (status) query.set('status', status);
    if (requesterType) query.set('requesterType', requesterType);
    if (params.vehicleNo) query.set('vehicleNo', params.vehicleNo);
    if (params.requesterName) query.set('requesterName', params.requesterName);
    if (params.spaceCode) query.set('spaceCode', params.spaceCode);
    query.set('page', String(targetPage));
    return `/admin/reservations?${query.toString()}`;
  };

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">예약 목록</h1>
        <p className="mt-1 text-sm text-slate-600">
          신청자 개인정보가 그대로 표시됩니다. 상세 화면 열람 이력은 감사 로그에 기록되며, 업무 목적
          외 사용이나 외부 공유는 금지됩니다.
        </p>
      </div>

      <section className="card">
        <div className="card-body">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label htmlFor="filter-date" className="label">
                날짜
              </label>
              <input
                id="filter-date"
                name="date"
                type="date"
                defaultValue={date}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="filter-status" className="label">
                예약 상태
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={status ?? ''}
                className="input"
              >
                <option value="">전체</option>
                {Object.values(ReservationStatus).map((value) => (
                  <option key={value} value={value}>
                    {RESERVATION_STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-type" className="label">
                신청 구분
              </label>
              <select
                id="filter-type"
                name="requesterType"
                defaultValue={requesterType ?? ''}
                className="input"
              >
                <option value="">전체</option>
                {Object.values(RequesterType).map((value) => (
                  <option key={value} value={value}>
                    {REQUESTER_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-vehicle" className="label">
                차량번호
              </label>
              <input
                id="filter-vehicle"
                name="vehicleNo"
                defaultValue={params.vehicleNo ?? ''}
                className="input"
                placeholder="12가3456"
              />
            </div>
            <div>
              <label htmlFor="filter-name" className="label">
                성명
              </label>
              <input
                id="filter-name"
                name="requesterName"
                defaultValue={params.requesterName ?? ''}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="filter-space" className="label">
                주차 위치
              </label>
              <input
                id="filter-space"
                name="spaceCode"
                defaultValue={params.spaceCode ?? ''}
                className="input"
                placeholder="A-01"
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
              <button type="submit" className="btn btn-primary px-6">
                검색
              </button>
              <Link href="/admin/reservations" className="btn btn-secondary">
                초기화
              </Link>
            </div>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <p className="text-sm font-bold text-slate-700">전체 {result.totalCount}건</p>

          {result.items.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">조건에 해당하는 예약이 없습니다.</p>
          ) : (
            <div className="table-scroll mt-3">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>예약번호</th>
                    <th>상태</th>
                    <th>구분</th>
                    <th>방문 상호/지사</th>
                    <th>성명</th>
                    <th>이메일</th>
                    <th>차량번호</th>
                    <th>방문 시간</th>
                    <th>배정 위치</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((reservation) => (
                    <tr key={reservation.reservationId}>
                      <td className="font-mono text-xs">{reservation.reservationNo}</td>
                      <td>
                        <StatusBadge status={reservation.reservationStatus} />
                      </td>
                      <td>{REQUESTER_TYPE_LABEL[reservation.requesterType]}</td>
                      <td>{reservation.companyOrBranchName}</td>
                      <td>{reservation.requesterName}</td>
                      <td className="text-xs">{reservation.requesterEmail}</td>
                      <td className="font-mono text-xs">{reservation.vehicleNo}</td>
                      <td className="text-xs whitespace-nowrap">
                        {formatKstDateTime(reservation.visitStartAt)}
                        <br />~ {formatKstDateTime(reservation.visitEndAt)}
                      </td>
                      <td>
                        {reservation.assignedSpaceCode ? (
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="font-mono font-bold">
                              {reservation.assignedSpaceCode}
                            </span>
                            {reservation.assignedSpaceType && (
                              <SpaceTypeBadge spaceType={reservation.assignedSpaceType} />
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {reservation.recommendedSpaceCode
                              ? `추천 ${reservation.recommendedSpaceCode}`
                              : '미배정'}
                          </span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/admin/reservations/${reservation.reservationId}`}
                          className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2">
              {result.page > 1 && (
                <Link
                  href={buildPageHref(result.page - 1)}
                  className="btn btn-secondary min-h-9 px-3 text-xs"
                >
                  이전
                </Link>
              )}
              <span className="text-sm text-slate-600">
                {result.page} / {result.totalPages}
              </span>
              {result.page < result.totalPages && (
                <Link
                  href={buildPageHref(result.page + 1)}
                  className="btn btn-secondary min-h-9 px-3 text-xs"
                >
                  다음
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}
