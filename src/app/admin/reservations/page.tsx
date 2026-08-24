import { RequesterType, ReservationStatus } from '@prisma/client';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { ReservationBulkRejectTable } from '@/components/admin/reservation-bulk-reject-table';
import { Alert } from '@/components/ui/alert';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import {
  REQUESTER_TYPE_LABEL,
  RESERVATION_STATUS_FILTER_OPTIONS,
  RESERVATION_STATUS_LABEL,
} from '@/domain/reservation-status';
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
    /** 승인·반려 처리 후 목록으로 돌아올 때 붙는 예약번호. 완료 안내에만 쓴다. */
    approved?: string;
    rejected?: string;
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
    params.status &&
    (RESERVATION_STATUS_FILTER_OPTIONS as readonly string[]).includes(params.status)
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

  /*
   * 승인 직후 목록으로 돌아왔을 때만 완료 안내를 띄운다.
   * 값은 화면에 그대로 찍히므로 예약번호 형식이 맞을 때만 쓴다.
   */
  const isReservationNo = (value?: string) =>
    Boolean(value && /^PK-\d{8}-[A-Z2-9]{6}$/.test(value));
  const approvedNo = isReservationNo(params.approved) ? params.approved : null;
  const rejectedNo = isReservationNo(params.rejected) ? params.rejected : null;

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

      {approvedNo && (
        <Alert variant="success" title="승인 처리를 완료했습니다">
          예약 <span className="font-mono font-bold">{approvedNo}</span> 이(가) 승인되었습니다.
          신청자에게 승인 안내 메일이 발송되었습니다.
        </Alert>
      )}

      {rejectedNo && (
        <Alert variant="warning" title="반려 처리를 완료했습니다">
          예약 <span className="font-mono font-bold">{rejectedNo}</span> 이(가) 반려되었습니다.
          신청자에게 반려 사유가 메일로 발송되었습니다.
        </Alert>
      )}

      <FilterBar chips={chips} resetHref={BASE_PATH} emptyLabel="전체 예약을 보고 있습니다.">
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
              {RESERVATION_STATUS_FILTER_OPTIONS.map((value) => (
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
      </FilterBar>

      <section className="card">
        <div className="card-body">
          <ReservationBulkRejectTable
            basePath={BASE_PATH}
            totalCount={result.totalCount}
            pendingCount={result.pendingCount}
            items={result.items.map((reservation) => ({
              reservationId: reservation.reservationId,
              reservationNo: reservation.reservationNo,
              reservationStatus: reservation.reservationStatus,
              requesterType: reservation.requesterType,
              companyOrBranchName: reservation.companyOrBranchName,
              requesterName: reservation.requesterName,
              requesterEmail: reservation.requesterEmail,
              vehicleNo: reservation.vehicleNo,
              visitStartText: formatKstDateTime(reservation.visitStartAt),
              visitEndText: formatKstDateTime(reservation.visitEndAt),
              createdAtText: formatKstDateTime(reservation.createdAt),
            }))}
          />

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
