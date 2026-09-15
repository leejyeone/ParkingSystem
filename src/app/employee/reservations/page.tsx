import type { ReservationStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { EmployeeRecurringScheduleList } from '@/components/employee/employee-reservation-tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { RESERVATION_STATUS_LABEL, reservationStatusFilterOptions } from '@/domain/reservation-status';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { kstDayRangeUtc } from '@/lib/datetime';
import {
  listEmployeeActivity,
  type EmployeeActivityKind,
} from '@/services/employee-activity-service';
import { listRecurringSchedulesForEmployee } from '@/services/recurring-reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '예약 조회' };

const BASE_PATH = '/employee/reservations';

/** 반복 예약은 개별 항목이 아니라 시리즈 요약이라 listEmployeeActivity 대상이 아니다 — 탭 값으로만 쓴다. */
const RECURRING_TAB = 'RECURRING' as const;
type TabValue = EmployeeActivityKind | typeof RECURRING_TAB;

const ACTIVITY_KIND_VALUES: EmployeeActivityKind[] = [
  'EMPLOYEE_VISIT',
  'PROXY_VISIT',
  'COMPANY_VEHICLE',
];

type PageProps = {
  searchParams: Promise<{
    kind?: string;
    date?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function EmployeeReservationsPage({ searchParams }: PageProps) {
  const session = await requireEmployeePage(BASE_PATH);
  const settings = await getSystemSettings();
  const params = await searchParams;

  const statusFilterOptions = reservationStatusFilterOptions(settings.entryExitManagementEnabled);
  const requestedKind: TabValue | undefined =
    params.kind === RECURRING_TAB
      ? RECURRING_TAB
      : ACTIVITY_KIND_VALUES.includes(params.kind as EmployeeActivityKind)
        ? (params.kind as EmployeeActivityKind)
        : undefined;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const range = date ? kstDayRangeUtc(date) : null;
  const status =
    params.status && (statusFilterOptions as readonly string[]).includes(params.status)
      ? (params.status as ReservationStatus)
      : undefined;
  const keyword = params.q?.trim() || undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const activityKind = requestedKind === RECURRING_TAB ? undefined : requestedKind;

  const [result, schedules] = await Promise.all([
    listEmployeeActivity(session.employeeUserId, {
      kind: activityKind,
      status,
      dateFrom: range?.start,
      dateTo: range?.end,
      keyword,
      page,
      pageSize: 20,
    }),
    listRecurringSchedulesForEmployee(session.employeeUserId),
  ]);

  // 반복 예약 탭이 있어야 할 이유가 없어졌는데(전부 취소 등) URL 에 남아 있으면 전체 탭으로 되돌린다.
  const isRecurringTab = requestedKind === RECURRING_TAB && schedules.length > 0;
  const kind = isRecurringTab ? undefined : (requestedKind as EmployeeActivityKind | undefined);

  const kindTabs: { value?: TabValue; label: string; count: number }[] = [
    { value: undefined, label: '전체', count: result.counts.ALL },
    { value: 'EMPLOYEE_VISIT', label: '내 방문신청', count: result.counts.EMPLOYEE_VISIT },
    ...(schedules.length > 0
      ? [{ value: RECURRING_TAB, label: '반복 예약', count: schedules.length }]
      : []),
    { value: 'PROXY_VISIT', label: '방문객 대리 신청', count: result.counts.PROXY_VISIT },
    { value: 'COMPANY_VEHICLE', label: '법인 차량 예약', count: result.counts.COMPANY_VEHICLE },
  ];

  const currentFilters: Record<string, string | undefined> = {
    kind: isRecurringTab ? RECURRING_TAB : kind,
    date,
    status,
    q: keyword,
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
    { key: 'date', label: '날짜', value: date },
    { key: 'status', label: '상태', value: status ? RESERVATION_STATUS_LABEL[status] : undefined },
    { key: 'q', label: '검색어', value: keyword },
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
        <h1 className="text-ink text-xl font-black sm:text-2xl">예약 조회</h1>
      </div>

      <nav className="bg-surface-hover flex flex-wrap gap-1 rounded-lg p-1">
        {kindTabs.map((tab) => {
          const active = isRecurringTab ? tab.value === RECURRING_TAB : kind === tab.value;
          return (
            <Link
              key={tab.label}
              href={buildHref({ kind: tab.value, page: undefined })}
              className={`rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                active ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-active'
              }`}
            >
              {tab.label} ({tab.count})
            </Link>
          );
        })}
      </nav>

      {isRecurringTab ? (
        <section className="card">
          <div className="card-body">
            <h2 className="card-title">반복 예약</h2>
            <p className="field-hint">관리자가 배정한 정기 주차 시리즈입니다.</p>
            <EmployeeRecurringScheduleList schedules={schedules} />
          </div>
        </section>
      ) : (
        <>
          <FilterBar chips={chips} resetHref={BASE_PATH} emptyLabel="전체 내역을 보고 있습니다.">
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kind && <input type="hidden" name="kind" value={kind} />}
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
                  상태
                </label>
                <select id="filter-status" name="status" defaultValue={status ?? ''} className="input">
                  <option value="">전체</option>
                  {statusFilterOptions.map((value) => (
                    <option key={value} value={value}>
                      {RESERVATION_STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filter-q" className="label">
                  검색어
                </label>
                <input
                  id="filter-q"
                  name="q"
                  defaultValue={keyword ?? ''}
                  className="input"
                  placeholder="성명 / 차량번호 / 목적"
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                <button type="submit" className="btn btn-primary px-6">
                  검색
                </button>
                <Link
                  href={buildHref({ date: undefined, status: undefined, q: undefined })}
                  className="btn btn-secondary"
                >
                  초기화
                </Link>
              </div>
            </form>
          </FilterBar>

          <section className="card">
            <div className="card-body">
              <h2 className="card-title">신청 내역</h2>

              {result.items.length === 0 ? (
                <p className="text-ink-faint mt-3 text-sm">조건에 맞는 신청 내역이 없습니다.</p>
              ) : (
                <div className="table-scroll mt-3">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>구분</th>
                        <th>예약번호</th>
                        <th>성명</th>
                        <th>차량번호</th>
                        <th>일시</th>
                        <th>목적</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item) => (
                        <ClickableTableRow key={`${item.kind}-${item.id}`} href={item.href}>
                          <td className="text-xs whitespace-nowrap">{item.kindLabel}</td>
                          <td className="font-mono text-xs">{item.no}</td>
                          <td className="text-xs">{item.requesterName}</td>
                          <td className="font-mono text-xs">{item.vehicleNo}</td>
                          <td className="text-xs whitespace-nowrap">{item.dateRangeText}</td>
                          <td className="max-w-[12rem] truncate text-xs" title={item.purpose}>
                            {item.purpose}
                          </td>
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
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
                  <span className="text-ink-muted text-sm">
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
        </>
      )}
    </main>
  );
}
