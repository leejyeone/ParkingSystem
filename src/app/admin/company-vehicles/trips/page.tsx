import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/ui/status-badge';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstRange } from '@/lib/datetime';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인차량 신청내역' };

type PageProps = { searchParams: Promise<{ vehicleId?: string }> };

export default async function CompanyVehicleTripsPage({ searchParams }: PageProps) {
  await requireAdminPage('/admin/company-vehicles/trips');
  const { vehicleId: vehicleIdParam } = await searchParams;
  const vehicleId = vehicleIdParam ? Number(vehicleIdParam) : undefined;

  const [trips, vehicles] = await Promise.all([
    listCompanyVehicleTrips({
      vehicleId: vehicleId && Number.isFinite(vehicleId) ? vehicleId : undefined,
    }),
    listCompanyVehicles({ includeInactive: true }),
  ]);

  const filteredVehicle = vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/company-vehicles" className="text-brand-700 text-sm font-semibold">
          ← 법인차량 관리
        </Link>
        <h1 className="text-ink mt-2 text-xl font-black sm:text-2xl">법인차량 신청내역</h1>
        <p className="text-ink-muted mt-1 text-sm">
          직원이 신청한 법인 공용 차량 운행 내역입니다. 행을 클릭하면 상세에서 승인·반려·차량
          배정·입출차 처리를 할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/company-vehicles/trips"
          className={`badge ${!vehicleId ? 'bg-brand-700 text-white' : 'bg-surface-hover text-ink-muted'}`}
        >
          전체
        </Link>
        {vehicles.map((vehicle) => (
          <Link
            key={vehicle.vehicleId}
            href={`/admin/company-vehicles/trips?vehicleId=${vehicle.vehicleId}`}
            className={`badge ${
              vehicleId === vehicle.vehicleId
                ? 'bg-brand-700 text-white'
                : 'bg-surface-hover text-ink-muted'
            }`}
          >
            {vehicle.vehicleNo}
          </Link>
        ))}
      </div>

      {vehicleId && !filteredVehicle && (
        <p className="text-sm text-red-600">선택한 차량을 찾을 수 없어 전체 목록을 보여줍니다.</p>
      )}

      <section className="card">
        <div className="card-body">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>운행 일시</th>
                  <th>신청 직원</th>
                  <th>배정 차량</th>
                  <th>사유</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-ink-faint text-center text-sm">
                      운행 신청 내역이 없습니다.
                    </td>
                  </tr>
                )}
                {trips.map((trip) => (
                  <tr key={trip.tripId}>
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
                    <td className="text-right">
                      <Link
                        href={`/admin/company-vehicles/trips/${trip.tripId}`}
                        className="text-brand-700 text-xs font-semibold"
                      >
                        상세 보기 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
