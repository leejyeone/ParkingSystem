import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import {
  COMPANY_VEHICLE_LOG_COLUMNS,
  formatDestinationCell,
  formatProgressStatusCell,
  formatRequestDateCell,
  formatVehicleModelCell,
  resolveDistanceKm,
} from '@/domain/company-vehicle-log';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstTime, kstDayRangeUtc, shiftKstDateString, todayKstDateString } from '@/lib/datetime';
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
 * listCompanyVehicleTrips 의 vehicleId 필터(= assignedVehicleId 기준) 그대로 제외되고,
 * 승인은 됐지만 아직 실제로 출차하지 않은 신청도 actualEntryOnly 필터로 제외된다 —
 * 대장에는 "실제로 있었던 일"만 남긴다. 처리 상태(승인/반려 등)는 대장의 관심사가
 * 아니므로 표에 보여주지 않는다.
 *
 * 기본 정렬은 운행 일시(신청 폼에서 고른 requestStartAt) 오름차순 — 종이 운행일지처럼
 * 시간순으로 누적되는 형태다. actualEntryOnly 필터 덕분에 이 화면에 오는 행은 실제로
 * 반납 처리까지 끝난 신청만 남는다("실제로 있었던 일"만 기록).
 *
 * 기간을 따로 고르지 않으면 최근 30일치만 기본으로 보여주고(대장이 무한정 길어지지
 * 않게), 기간을 하나라도 직접 고르면 그 지정대로 전체 기간을 조회한다(30일 제한 없음).
 */
export default async function CompanyVehicleLogPage({ searchParams }: PageProps) {
  await requireAdminPage(BASE_PATH);
  const params = await searchParams;
  const vehicles = await listCompanyVehicles({ includeInactive: true });

  // 탭은 항상 하나가 선택돼 있어야 자연스러우므로, 지정이 없으면 첫 차량을 기본으로 본다.
  const requestedVehicleId =
    params.vehicleId && Number(params.vehicleId) > 0 ? Number(params.vehicleId) : undefined;
  const vehicleId = requestedVehicleId ?? vehicles[0]?.vehicleId;

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
  const sort = params.sort === 'request_desc' ? 'request_desc' : 'request_asc';

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  const trips = vehicleId
    ? await listCompanyVehicleTrips({
        vehicleId,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        actualEntryOnly: true,
        order: sort === 'request_desc' ? 'requestStartAt_desc' : 'requestStartAt_asc',
      })
    : [];

  const currentFilters: Record<string, string | undefined> = {
    vehicleId: vehicleId ? String(vehicleId) : undefined,
    dateFrom: explicitDateFrom,
    dateTo: explicitDateTo,
    sort: sort === 'request_desc' ? sort : undefined,
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
    { key: 'dateFrom', label: '기간(부터)', value: explicitDateFrom },
    { key: 'dateTo', label: '기간(까지)', value: explicitDateTo },
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
          탭에서 차량을 고르면 그 차량이 실제로 반납 처리된 운행 기록만, 신청 폼에서 고른
          운행 예정 시간 순으로 모아 보여줍니다. 아직 반납 처리하지 않은 신청은 여기 나오지
          않습니다. 기간을 따로 고르지 않으면 최근 30일치만 보여주고, 기간을 직접 고르면 그
          범위 전체를 조회합니다.
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
            emptyLabel="최근 30일 기간을 보고 있습니다."
          >
            <form method="get" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="vehicleId" value={vehicleId} />
              {sort === 'request_desc' && <input type="hidden" name="sort" value={sort} />}
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-surface-hover flex gap-0.5 rounded-md p-0.5 text-xs">
                    <Link
                      href={buildHref({ sort: undefined })}
                      className={`rounded px-2 py-1 font-bold transition ${
                        sort === 'request_asc'
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-ink-faint hover:text-ink-muted'
                      }`}
                    >
                      운행 일시 오름차순
                    </Link>
                    <Link
                      href={buildHref({ sort: 'request_desc' })}
                      className={`rounded px-2 py-1 font-bold transition ${
                        sort === 'request_desc'
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-ink-faint hover:text-ink-muted'
                      }`}
                    >
                      내림차순
                    </Link>
                  </div>
                  <a
                    href={`/api/admin/company-vehicle-trips/log-export?${new URLSearchParams(
                      Object.fromEntries(
                        Object.entries({
                          vehicleId: vehicleId ? String(vehicleId) : undefined,
                          // 화면에 실제로 적용된(30일 기본값 포함) 기간 그대로 내려받는다.
                          dateFrom,
                          dateTo,
                          sort: sort === 'request_desc' ? sort : undefined,
                        }).filter((entry): entry is [string, string] => Boolean(entry[1])),
                      ),
                    ).toString()}`}
                    className="btn btn-secondary btn-sm"
                  >
                    엑셀 다운로드
                  </a>
                </div>
              </div>
              <div className="table-scroll mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      {COMPANY_VEHICLE_LOG_COLUMNS.map((column) => (
                        <th key={column} className="whitespace-pre-line">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trips.length === 0 && (
                      <tr>
                        <td
                          colSpan={COMPANY_VEHICLE_LOG_COLUMNS.length}
                          className="text-ink-faint text-center text-sm"
                        >
                          이 조건에 해당하는 운행 기록이 없습니다.
                        </td>
                      </tr>
                    )}
                    {trips.map((trip, index) => {
                      const distanceKm = resolveDistanceKm(trip);
                      return (
                        <ClickableTableRow
                          key={trip.tripId}
                          href={`/admin/company-vehicles/trips/${trip.tripId}?returnTo=${encodeURIComponent(buildHref())}`}
                        >
                          <td className="text-xs whitespace-nowrap">{index + 1}</td>
                          <td className="text-xs whitespace-nowrap">{formatRequestDateCell(trip)}</td>
                          <td className="text-xs whitespace-nowrap">{trip.employee.departmentName}</td>
                          <td className="text-xs whitespace-nowrap">{trip.employee.name}</td>
                          <td className="text-xs whitespace-nowrap">{formatVehicleModelCell(trip)}</td>
                          <td className="text-xs whitespace-nowrap">
                            {formatKstTime(trip.requestStartAt)} ~ {formatKstTime(trip.requestEndAt)}
                          </td>
                          <td className="max-w-xs truncate text-xs" title={formatDestinationCell(trip)}>
                            {formatDestinationCell(trip)}
                          </td>
                          <td className="text-xs whitespace-nowrap">
                            {distanceKm !== null ? `${distanceKm}km` : '-'}
                          </td>
                          <td className="text-xs whitespace-nowrap">{formatProgressStatusCell(trip)}</td>
                        </ClickableTableRow>
                      );
                    })}
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
