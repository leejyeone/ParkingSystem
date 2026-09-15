import { ReservationStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  RESERVATION_STATUS_LABEL,
  reservationStatusFilterOptions,
} from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstRange, kstDayRangeUtc } from '@/lib/datetime';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인차량 신청내역' };

const BASE_PATH = '/admin/company-vehicles/trips';

type PageProps = {
  searchParams: Promise<{
    date?: string;
    status?: string;
    employeeName?: string;
    vehicleId?: string;
  }>;
};

export default async function CompanyVehicleTripsPage({ searchParams }: PageProps) {
  await requireAdminPage(BASE_PATH);
  const params = await searchParams;
  const settings = await getSystemSettings();
  const statusFilterOptions = reservationStatusFilterOptions(settings.entryExitManagementEnabled);

  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  const range = date ? kstDayRangeUtc(date) : null;
  const status =
    params.status && (statusFilterOptions as readonly string[]).includes(params.status)
      ? (params.status as ReservationStatus)
      : undefined;
  const employeeName = params.employeeName?.trim() || undefined;
  const vehicleId = params.vehicleId && Number(params.vehicleId) > 0 ? Number(params.vehicleId) : undefined;

  const [trips, vehicles] = await Promise.all([
    listCompanyVehicleTrips({
      vehicleId,
      status,
      employeeName,
      dateFrom: range?.start,
      dateTo: range?.end,
    }),
    listCompanyVehicles({ includeInactive: true }),
  ]);

  const currentFilters: Record<string, string | undefined> = {
    date,
    status,
    employeeName,
    vehicleId: vehicleId ? String(vehicleId) : undefined,
  };

  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...currentFilters, ...overrides })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `${BASE_PATH}?${queryString}` : BASE_PATH;
  };

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  const chips: FilterChip[] = [
    { key: 'date', label: '날짜', value: date },
    { key: 'status', label: '상태', value: status ? RESERVATION_STATUS_LABEL[status] : undefined },
    { key: 'employeeName', label: '신청 직원', value: employeeName },
    { key: 'vehicleId', label: '차량', value: selectedVehicle?.vehicleNo },
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
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인차량 신청내역</h1>
        <p className="text-ink-muted mt-1 text-sm">
          직원이 신청한 법인 공용 차량 운행 내역입니다. 행을 누르면 상세에서 승인·반려·차량
          배정·입출차 처리를 할 수 있습니다.
        </p>
      </div>

      <FilterBar chips={chips} resetHref={BASE_PATH} emptyLabel="전체 신청내역을 보고 있습니다.">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-date" className="label">
              날짜
            </label>
            <input id="filter-date" name="date" type="date" defaultValue={date} className="input" />
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
            <label htmlFor="filter-employee" className="label">
              신청 직원
            </label>
            <input
              id="filter-employee"
              name="employeeName"
              defaultValue={employeeName ?? ''}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="filter-vehicle" className="label">
              차량
            </label>
            <select
              id="filter-vehicle"
              name="vehicleId"
              defaultValue={vehicleId ? String(vehicleId) : ''}
              className="input"
            >
              <option value="">전체</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                  {vehicle.vehicleNo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
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
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>신청번호</th>
                  <th>상태</th>
                  <th>운행 일시</th>
                  <th>신청 직원</th>
                  <th>배정 차량</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-faint text-center text-sm">
                      조건에 해당하는 신청내역이 없습니다.
                    </td>
                  </tr>
                )}
                {trips.map((trip) => (
                  <ClickableTableRow
                    key={trip.tripId}
                    href={`/admin/company-vehicles/trips/${trip.tripId}?returnTo=${encodeURIComponent(buildHref())}`}
                  >
                    <td className="font-mono text-xs whitespace-nowrap">
                      {trip.tripNo ?? `#${trip.tripId}`}
                    </td>
                    <td>
                      <StatusBadge status={trip.tripStatus} />
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstRange(trip.requestStartAt, trip.requestEndAt)}
                    </td>
                    <td className="text-xs">
                      {trip.employee.name} ({trip.employee.departmentName})
                    </td>
                    <td className="text-xs">{trip.assignedVehicle?.vehicleNo ?? '-'}</td>
                    <td className="max-w-xs truncate text-xs" title={trip.reason}>
                      {trip.reason}
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
