import { ReservationStatus, RequesterType } from '@prisma/client';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { ReservationFilterBar, type FilterChip } from '@/components/admin/reservation-filter-bar';
import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL, RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { getSystemSettings } from '@/services/settings-service';
import { formatKstDateTime, kstDayRangeUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { listReservationsForAdmin } from '@/services/reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '예약 목록' };

const BASE_PATH = '/admin/reservations';

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
  const session = await requireAdminPage(BASE_PATH);
  const params = await searchParams;
  const requestHeaders = await headers();
  const settings = await getSystemSettings();
  const showSpace = settings.spaceAssignmentEnabled;

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
  // 공백만 입력된 값이 조건 칩으로 뜨지 않도록 정규화한다.
  const vehicleNo = params.vehicleNo?.trim() || undefined;
  const requesterName = params.requesterName?.trim() || undefined;
  // 주차면 배정을 쓰지 않으면 주차 위치 조건 자체를 무시한다.
  const spaceCode = showSpace ? params.spaceCode?.trim() || undefined : undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const result = await listReservationsForAdmin(
    {
      dateFrom: range?.start,
      dateTo: range?.end,
      status,
      requesterType,
      vehicleNo,
      requesterName,
      spaceCode,
      page,
      pageSize: 20,
    },
    {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(requestHeaders),
    },
  );

  /** 현재 적용된 검색 조건. page 는 넣지 않아 조건이 바뀌면 1페이지부터 다시 본다. */
  const currentFilters: Record<string, string | undefined> = {
    date,
    status,
    requesterType,
    vehicleNo,
    requesterName,
    spaceCode,
  };

  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...currentFilters, ...overrides })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `${BASE_PATH}?${queryString}` : BASE_PATH;
  };

  const buildPageHref = (targetPage: number) => buildHref({ page: String(targetPage) });

  // 적용된 조건만 칩으로 노출한다. (모바일에서 입력 폼이 화면을 다 차지하지 않도록)
  const chips: FilterChip[] = [
    { key: 'date', label: '날짜', value: date },
    { key: 'status', label: '상태', value: status ? RESERVATION_STATUS_LABEL[status] : undefined },
    {
      key: 'requesterType',
      label: '구분',
      value: requesterType ? REQUESTER_TYPE_LABEL[requesterType] : undefined,
    },
    { key: 'vehicleNo', label: '차량번호', value: vehicleNo },
    { key: 'requesterName', label: '성명', value: requesterName },
    ...(showSpace ? [{ key: 'spaceCode', label: '주차 위치', value: spaceCode }] : []),
  ]
    .filter((filter): filter is { key: string; label: string; value: string } =>
      Boolean(filter.value),
    )
    .map((filter) => ({
      label: filter.label,
      value: filter.value,
      removeHref: buildHref({ [filter.key]: undefined }),
    }));

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">예약 목록</h1>
        <p className="mt-1 text-sm text-slate-600">
          신청자 개인정보가 그대로 표시됩니다. 상세 화면 열람 이력은 감사 로그에 기록되며, 업무 목적
          외 사용이나 외부 공유는 금지됩니다.
        </p>
      </div>

      <ReservationFilterBar chips={chips} resetHref={BASE_PATH}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-date" className="label">
              날짜
            </label>
            <input id="filter-date" name="date" type="date" defaultValue={date} className="input" />
          </div>
          <div>
            <label htmlFor="filter-status" className="label">
              예약 상태
            </label>
            <select id="filter-status" name="status" defaultValue={status ?? ''} className="input">
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
              defaultValue={vehicleNo ?? ''}
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
              defaultValue={requesterName ?? ''}
              className="input"
            />
          </div>
          {showSpace && (
            <div>
              <label htmlFor="filter-space" className="label">
                주차 위치
              </label>
              <input
                id="filter-space"
                name="spaceCode"
                defaultValue={spaceCode ?? ''}
                className="input"
                placeholder="A-01"
              />
            </div>
          )}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" className="btn btn-primary px-6">
              검색
            </button>
            <Link href={BASE_PATH} className="btn btn-secondary">
              초기화
            </Link>
          </div>
        </form>
      </ReservationFilterBar>

      <section className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-slate-700">전체 {result.totalCount}건</p>
            {result.items.length > 0 && (
              <p className="text-xs text-slate-500">행을 누르면 상세 화면으로 이동합니다.</p>
            )}
          </div>

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
                    {showSpace && <th>배정 위치</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((reservation) => (
                    <ClickableTableRow
                      key={reservation.reservationId}
                      href={`${BASE_PATH}/${reservation.reservationId}`}
                    >
                      <td className="font-mono text-xs">
                        {/* 키보드 이동과 새 탭 열기를 위해 실제 링크를 둔다. */}
                        <Link
                          href={`${BASE_PATH}/${reservation.reservationId}`}
                          className="text-brand-700 font-bold hover:underline"
                        >
                          {reservation.reservationNo}
                        </Link>
                      </td>
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
                      {showSpace && (
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
                      )}
                    </ClickableTableRow>
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
