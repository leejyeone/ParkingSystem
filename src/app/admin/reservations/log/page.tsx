import { RequesterType } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { VisitorEntryLogPreviewPanel } from '@/components/admin/visitor-entry-log-preview-panel';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import {
  VISITOR_ENTRY_LOG_COLUMNS,
  VISITOR_ENTRY_LOG_PAGE_SIZE,
  formatEntryTimeCell,
  formatExitTimeCell,
  formatVisitDateCell,
} from '@/domain/visitor-entry-log';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { kstDayRangeUtc, shiftKstDateString, todayKstDateString } from '@/lib/datetime';
import { listCompletedVisitReservations } from '@/services/reservation-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '입출차 내역' };

const BASE_PATH = '/admin/reservations/log';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PageProps = {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; requesterType?: string; page?: string }>;
};

/**
 * 완료된(EXITED) 방문 예약 입출차 내역 — 법인차량 운행 대장(`/admin/company-vehicles/log`)과
 * 같은 양식이다(엑셀도 같은 구조: `visitor-entry-log-excel.ts` 참고). 차량별 탭이 없는
 * 대신 전체 방문객을 기간으로만 본다.
 *
 * 기간을 따로 고르지 않으면 최근 30일치만 기본으로 보여주고, 기간을 하나라도 직접 고르면
 * 그 지정대로 전체 기간을 조회한다(법인차량 운행 대장 페이지와 동일한 규칙).
 */
export default async function VisitorEntryLogPage({ searchParams }: PageProps) {
  await requireAdminPage(BASE_PATH);
  const params = await searchParams;

  const explicitDateFrom =
    params.dateFrom && DATE_PATTERN.test(params.dateFrom) ? params.dateFrom : undefined;
  const explicitDateTo =
    params.dateTo && DATE_PATTERN.test(params.dateTo) ? params.dateTo : undefined;
  const hasExplicitDateFilter = Boolean(explicitDateFrom || explicitDateTo);
  const today = todayKstDateString();
  const dateFrom = explicitDateFrom ?? (hasExplicitDateFilter ? undefined : shiftKstDateString(today, -29));
  const dateTo = explicitDateTo ?? (hasExplicitDateFilter ? undefined : today);
  const rangeFrom = dateFrom ? kstDayRangeUtc(dateFrom).start : undefined;
  const rangeTo = dateTo ? kstDayRangeUtc(dateTo).end : undefined;
  const requesterType =
    params.requesterType && params.requesterType in RequesterType
      ? (params.requesterType as RequesterType)
      : undefined;

  const reservations = await listCompletedVisitReservations({
    dateFrom: rangeFrom,
    dateTo: rangeTo,
    requesterType,
  });

  // 원본 종이 양식 한 장이 20행짜리라, 화면도 20건 단위로 페이지를 나누고 페이지마다
  // No를 1부터 다시 매긴다(법인차량 운행 대장 페이지와 같은 규칙).
  const pageParam = Math.max(1, Number(params.page) || 1);
  const totalPages = Math.max(1, Math.ceil(reservations.length / VISITOR_ENTRY_LOG_PAGE_SIZE));
  const currentPage = Math.min(pageParam, totalPages);
  const pagedReservations = reservations.slice(
    (currentPage - 1) * VISITOR_ENTRY_LOG_PAGE_SIZE,
    currentPage * VISITOR_ENTRY_LOG_PAGE_SIZE,
  );

  // page는 여기 넣지 않는다 — 기간 필터를 바꾸면 항상 1페이지부터 다시 보여줘야 하므로,
  // 페이지 링크(buildPageHref)에서만 명시적으로 넘긴다.
  const currentFilters: Record<string, string | undefined> = {
    dateFrom: explicitDateFrom,
    dateTo: explicitDateTo,
    requesterType,
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

  const chips: FilterChip[] = [
    { key: 'dateFrom', label: '기간(부터)', value: explicitDateFrom },
    { key: 'dateTo', label: '기간(까지)', value: explicitDateTo },
    { key: 'requesterType', label: '구분', value: requesterType ? REQUESTER_TYPE_LABEL[requesterType] : undefined },
  ]
    .filter((filter): filter is { key: string; label: string; value: string } => Boolean(filter.value))
    .map((filter) => ({
      label: filter.label,
      value: filter.value,
      removeHref: buildHref({ [filter.key]: undefined }),
    }));

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">입출차 내역</h1>
        <p className="text-ink-muted mt-1 text-sm">
          실제로 입차·출차까지 완료된 방문 예약만 시간순으로 모아 보여줍니다.
        </p>
      </div>

      <FilterBar
        chips={chips}
        resetHref={buildHref({ dateFrom: undefined, dateTo: undefined, requesterType: undefined })}
        emptyLabel="최근 30일 기간을 보고 있습니다."
      >
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="log-date-from" className="label">
              기간(부터)
            </label>
            <input id="log-date-from" name="dateFrom" type="date" defaultValue={dateFrom} className="input" />
          </div>
          <div>
            <label htmlFor="log-date-to" className="label">
              기간(까지)
            </label>
            <input id="log-date-to" name="dateTo" type="date" defaultValue={dateTo} className="input" />
          </div>
          <div>
            <label htmlFor="log-requester-type" className="label">
              구분
            </label>
            <select
              id="log-requester-type"
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
          <div className="flex items-end gap-2 sm:col-span-3">
            <button type="submit" className="btn btn-primary px-6">
              조회
            </button>
            <Link
              href={buildHref({ dateFrom: undefined, dateTo: undefined, requesterType: undefined })}
              className="btn btn-secondary"
            >
              초기화
            </Link>
          </div>
        </form>
      </FilterBar>

      <section className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title">입출차 기록</h2>
            <VisitorEntryLogPreviewPanel
              exportQuery={new URLSearchParams(
                Object.fromEntries(
                  Object.entries({
                    // 화면에 실제로 적용된(30일 기본값 포함) 기간·구분 그대로 미리보기·다운로드한다.
                    dateFrom,
                    dateTo,
                    requesterType,
                  }).filter((entry): entry is [string, string] => Boolean(entry[1])),
                ),
              ).toString()}
            />
          </div>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  {VISITOR_ENTRY_LOG_COLUMNS.map((column) => (
                    <th key={column} className="whitespace-pre-line">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedReservations.length === 0 && (
                  <tr>
                    <td colSpan={VISITOR_ENTRY_LOG_COLUMNS.length} className="text-ink-faint text-center text-sm">
                      이 조건에 해당하는 입출차 기록이 없습니다.
                    </td>
                  </tr>
                )}
                {pagedReservations.map((reservation, index) => (
                  <ClickableTableRow
                    key={reservation.reservationId}
                    href={`/admin/reservations/${reservation.reservationId}?returnTo=${encodeURIComponent(
                      buildHref({ page: currentPage > 1 ? String(currentPage) : undefined }),
                    )}`}
                  >
                    <td className="text-xs whitespace-nowrap">{index + 1}</td>
                    <td className="text-xs whitespace-nowrap">{formatVisitDateCell(reservation)}</td>
                    <td className="text-xs whitespace-nowrap">{reservation.companyOrBranchName}</td>
                    <td className="text-xs whitespace-nowrap">{reservation.requesterName}</td>
                    <td className="text-xs whitespace-nowrap">{reservation.vehicleNo}</td>
                    <td className="text-xs whitespace-nowrap">{formatEntryTimeCell(reservation)}</td>
                    <td className="text-xs whitespace-nowrap">{formatExitTimeCell(reservation)}</td>
                    <td className="max-w-xs truncate text-xs" title={reservation.visitPurpose ?? '-'}>
                      {reservation.visitPurpose ?? '-'}
                    </td>
                    <td className="text-xs whitespace-nowrap">{reservation.assignedSpace?.spaceCode ?? '-'}</td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2">
              {currentPage > 1 && (
                <Link href={buildPageHref(currentPage - 1)} className="btn btn-secondary min-h-9 px-3 text-xs">
                  이전
                </Link>
              )}
              <span className="text-ink-muted text-sm">
                {currentPage} / {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link href={buildPageHref(currentPage + 1)} className="btn btn-secondary min-h-9 px-3 text-xs">
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
