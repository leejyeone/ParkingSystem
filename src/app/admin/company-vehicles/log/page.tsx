import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
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
  searchParams: Promise<{ vehicleId?: string; dateFrom?: string; dateTo?: string }>;
};

/**
 * 차량별 운행 대장 — 실제 종이 운행일지처럼 한 차량의 운행 기록을 시간순으로 모아 본다.
 * 아직 차량이 배정되지 않은 신청(REQUESTED/REJECTED)은 "이 차의 운행 기록"이 아니므로
 * listCompanyVehicleTrips 의 vehicleId 필터(= assignedVehicleId 기준) 그대로 제외된다.
 */
export default async function CompanyVehicleLogPage({ searchParams }: PageProps) {
  await requireAdminPage(BASE_PATH);
  const params = await searchParams;
  const vehicles = await listCompanyVehicles({ includeInactive: true });

  const vehicleId =
    params.vehicleId && Number(params.vehicleId) > 0 ? Number(params.vehicleId) : undefined;
  const dateFrom = params.dateFrom && DATE_PATTERN.test(params.dateFrom) ? params.dateFrom : undefined;
  const dateTo = params.dateTo && DATE_PATTERN.test(params.dateTo) ? params.dateTo : undefined;
  const rangeFrom = dateFrom ? kstDayRangeUtc(dateFrom).start : undefined;
  const rangeTo = dateTo ? kstDayRangeUtc(dateTo).end : undefined;

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  const trips = vehicleId
    ? await listCompanyVehicleTrips({
        vehicleId,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        order: 'requestStartAt_asc',
      })
    : [];

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인차량 운행 대장</h1>
        <p className="text-ink-muted mt-1 text-sm">
          차량을 선택하면 그 차량에 실제로 배정된 운행을 신청 시간순으로 모아 보여줍니다.
        </p>
      </div>

      <section className="card">
        <div className="card-body">
          <form method="get" className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="log-vehicle" className="label">
                차량
              </label>
              <select
                id="log-vehicle"
                name="vehicleId"
                defaultValue={vehicleId ? String(vehicleId) : ''}
                className="input"
              >
                <option value="">차량을 선택하세요</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                    {vehicle.vehicleNo}
                    {vehicle.isActive ? '' : ' (비활성)'}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="flex items-end gap-2 sm:col-span-3">
              <button type="submit" className="btn btn-primary px-6">
                조회
              </button>
              <Link href={BASE_PATH} className="btn btn-secondary">
                초기화
              </Link>
            </div>
          </form>
        </div>
      </section>

      {!vehicleId ? (
        <section className="card">
          <div className="card-body">
            <p className="text-ink-faint text-sm">차량을 선택해 주세요.</p>
          </div>
        </section>
      ) : (
        <>
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
              <div className="table-scroll">
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
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-ink-faint text-center text-sm">
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
                        <td className="max-w-xs truncate text-xs">
                          {trip.rejectionReason ?? trip.cancelReason ?? '-'}
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
