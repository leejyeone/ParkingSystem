import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDate, formatKstTime, kstDayRangeUtc } from '@/lib/datetime';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인차량 운행 대장' };

const BASE_PATH = '/admin/company-vehicles/log';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PageProps = {
  searchParams: Promise<{ vehicleId?: string; dateFrom?: string; dateTo?: string; sort?: string }>;
};

/**
 * 차량별 운행 대장 — 실제 종이 운행일지처럼 한 차량의 운행 기록을 시간순으로 모아 본다.
 * 아직 차량이 배정되지 않은 신청(REQUESTED/REJECTED)은 "이 차의 운행 기록"이 아니므로
 * listCompanyVehicleTrips 의 vehicleId 필터(= assignedVehicleId 기준) 그대로 제외된다.
 *
 * 기본 정렬은 실제 운행 일시(실제 출차 시각) 오름차순 — 종이 운행일지처럼 실제 일어난
 * 순서대로 쌓인다. 아직 출차 처리 전이라 실제 운행 일시가 없는 행은 이 화면에 애초에
 * 나오지 않는다(assignedVehicleId 필터가 승인 이후 상태만 남기지만, 승인 직후~출차
 * 전 상태는 남을 수 있어 그런 행은 MySQL 기본 동작대로 오름차순에서 맨 앞에 온다).
 */
export default async function CompanyVehicleLogPage({ searchParams }: PageProps) {
  await requireAdminPage(BASE_PATH);
  const params = await searchParams;
  const vehicles = await listCompanyVehicles({ includeInactive: true });

  // 탭은 항상 하나가 선택돼 있어야 자연스러우므로, 지정이 없으면 첫 차량을 기본으로 본다.
  const requestedVehicleId =
    params.vehicleId && Number(params.vehicleId) > 0 ? Number(params.vehicleId) : undefined;
  const vehicleId = requestedVehicleId ?? vehicles[0]?.vehicleId;
  const dateFrom = params.dateFrom && DATE_PATTERN.test(params.dateFrom) ? params.dateFrom : undefined;
  const dateTo = params.dateTo && DATE_PATTERN.test(params.dateTo) ? params.dateTo : undefined;
  const rangeFrom = dateFrom ? kstDayRangeUtc(dateFrom).start : undefined;
  const rangeTo = dateTo ? kstDayRangeUtc(dateTo).end : undefined;
  const sort = params.sort === 'actual_desc' ? 'actual_desc' : 'actual_asc';

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  const trips = vehicleId
    ? await listCompanyVehicleTrips({
        vehicleId,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        order: sort === 'actual_desc' ? 'actualEntryAt_desc' : 'actualEntryAt_asc',
      })
    : [];

  const currentFilters: Record<string, string | undefined> = {
    vehicleId: vehicleId ? String(vehicleId) : undefined,
    dateFrom,
    dateTo,
    sort: sort === 'actual_desc' ? sort : undefined,
  };

  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...currentFilters, ...overrides })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `${BASE_PATH}?${queryString}` : BASE_PATH;
  };

  const chips: FilterChip[] = [
    { key: 'dateFrom', label: '기간(부터)', value: dateFrom },
    { key: 'dateTo', label: '기간(까지)', value: dateTo },
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
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인차량 운행 대장</h1>
        <p className="text-ink-muted mt-1 text-sm">
          탭에서 차량을 고르면 그 차량에 실제로 배정된 운행을 실제 운행 일시(실제 출차
          시각) 순으로 모아 보여줍니다.
        </p>
      </div>

      {vehicles.length === 0 || !vehicleId ? (
        <section className="card">
          <div className="card-body">
            <p className="text-ink-faint text-sm">등록된 법인차량이 없습니다.</p>
          </div>
        </section>
      ) : (
        <>
          <nav className="bg-surface-hover flex gap-1 overflow-x-auto rounded-lg p-1">
            {vehicles.map((vehicle) => (
              <Link
                key={vehicle.vehicleId}
                href={buildHref({ vehicleId: String(vehicle.vehicleId) })}
                className={`rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                  vehicle.vehicleId === vehicleId
                    ? 'bg-brand-700 text-white'
                    : 'text-ink-muted hover:bg-surface-active'
                }`}
              >
                {vehicle.vehicleNo}
                {!vehicle.isActive && ' (비활성)'}
              </Link>
            ))}
          </nav>

          <FilterBar
            chips={chips}
            resetHref={buildHref({ dateFrom: undefined, dateTo: undefined })}
            emptyLabel="전체 기간을 보고 있습니다."
          >
            <form method="get" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="vehicleId" value={vehicleId} />
              {sort === 'actual_desc' && <input type="hidden" name="sort" value={sort} />}
              <div>
                <label htmlFor="log-date-from" className="label">
                  기간(부터)
                </label>
                <input
                  id="log-date-from"
                  name="dateFrom"
                  type="date"
                  defaultValue={dateFrom}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="log-date-to" className="label">
                  기간(까지)
                </label>
                <input
                  id="log-date-to"
                  name="dateTo"
                  type="date"
                  defaultValue={dateTo}
                  className="input"
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-2">
                <button type="submit" className="btn btn-primary px-6">
                  조회
                </button>
                <Link
                  href={buildHref({ dateFrom: undefined, dateTo: undefined })}
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
                <h2 className="card-title">{selectedVehicle?.vehicleNo ?? '알 수 없는 차량'}</h2>
                <span className={`badge ${selectedVehicle?.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-active text-ink-muted'}`}>
                  {selectedVehicle?.isActive ? '활성' : '비활성'}
                </span>
              </div>
              <p className="text-ink-muted mt-1 text-sm">
                배정 주차 위치:{' '}
                {selectedVehicle?.parkingSpace
                  ? `${selectedVehicle.parkingSpace.spaceCode} (${selectedVehicle.parkingSpace.area.areaName})`
                  : '미지정'}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="card-title">운행 기록</h2>
                <div className="bg-surface-hover flex gap-0.5 rounded-md p-0.5 text-xs">
                  <Link
                    href={buildHref({ sort: undefined })}
                    className={`rounded px-2 py-1 font-bold transition ${
                      sort === 'actual_asc'
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-faint hover:text-ink-muted'
                    }`}
                  >
                    실제 운행 일시 오름차순
                  </Link>
                  <Link
                    href={buildHref({ sort: 'actual_desc' })}
                    className={`rounded px-2 py-1 font-bold transition ${
                      sort === 'actual_desc'
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-faint hover:text-ink-muted'
                    }`}
                  >
                    내림차순
                  </Link>
                </div>
              </div>
              <div className="table-scroll mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>운행일</th>
                      <th>운전자</th>
                      <th>운행시간</th>
                      <th>행선지</th>
                      <th>운행목적</th>
                      <th>주행거리</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-ink-faint text-center text-sm">
                          이 조건에 해당하는 운행 기록이 없습니다.
                        </td>
                      </tr>
                    )}
                    {trips.map((trip) => (
                      <ClickableTableRow
                        key={trip.tripId}
                        href={`/admin/company-vehicles/trips/${trip.tripId}`}
                      >
                        <td className="text-xs whitespace-nowrap">
                          {formatKstDate(trip.requestStartAt)}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {trip.employee.name} ({trip.employee.departmentName})
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {formatKstTime(trip.requestStartAt)} ~ {formatKstTime(trip.requestEndAt)}
                        </td>
                        <td className="text-xs">{trip.destination}</td>
                        <td className="max-w-xs truncate text-xs" title={trip.reason}>
                          {trip.reason}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {trip.odometerStartKm !== null && trip.odometerEndKm !== null
                            ? `${trip.odometerEndKm - trip.odometerStartKm}km`
                            : '-'}
                        </td>
                        <td>
                          <StatusBadge
                            status={trip.tripStatus}
                            label={COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE[trip.tripStatus]}
                          />
                        </td>
                      </ClickableTableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
