import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripActionPanel } from '@/components/admin/company-vehicle-trip-action-panel';
import {
  CompanyVehicleTripInfoCard,
  CompanyVehicleTripMileageCard,
  CompanyVehicleTripScheduleCard,
} from '@/components/admin/company-vehicle-trip-detail-cards';
import { StatusBadge } from '@/components/ui/status-badge';
import { RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, formatKstRange, utcToZonedInput } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { parseNumericId } from '@/lib/api-helpers';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { getCompanyVehicleTripDetail } from '@/services/company-vehicle-trip-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '운행 신청 상세' };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function CompanyVehicleTripDetailPage({ params, searchParams }: PageProps) {
  await requireAdminPage('/admin/company-vehicles/trips');
  const { id } = await params;

  /* 예약 상세와 같은 이유(목록·운행 대장 두 곳에서 들어올 수 있음)로 returnTo 를 신뢰
     범위(`/admin/`) 안에서만 뒤로가기에 쓴다. */
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo =
    typeof rawReturnTo === 'string' && rawReturnTo.startsWith('/admin/')
      ? rawReturnTo
      : '/admin/company-vehicles/trips';
  const returnLabel = returnTo.startsWith('/admin/company-vehicles/log')
    ? '← 운행 대장'
    : '← 운행 신청 목록';

  let tripId: number;
  try {
    tripId = parseNumericId(id, '운행 신청 ID');
  } catch {
    notFound();
  }

  let trip;
  try {
    trip = await getCompanyVehicleTripDetail(tripId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [vehicles, settings] = await Promise.all([listCompanyVehicles(), getSystemSettings()]);

  // 종료된 신청(반려/취소/출차/미방문)도 관리자가 내용을 정정할 수 있다 — 방문 예약
  // 상세와 같은 기준. 법인차량은 애초에 이 수정으로 이메일을 보내지 않는다.
  const editable = true;
  const editableFields = {
    employeeUserId: trip.employeeUserId,
    employeeLabel: `${trip.employee.name} (${trip.employee.departmentName})`,
    destination: trip.destination,
    reason: trip.reason,
    requestStartAt: utcToZonedInput(trip.requestStartAt),
    requestEndAt: utcToZonedInput(trip.requestEndAt),
    assignedVehicleId: trip.assignedVehicleId,
    actualEntryAt: trip.actualEntryAt ? utcToZonedInput(trip.actualEntryAt) : '',
    actualExitAt: trip.actualExitAt ? utcToZonedInput(trip.actualExitAt) : '',
    odometerStartKm: trip.odometerStartKm !== null ? String(trip.odometerStartKm) : '',
    odometerEndKm: trip.odometerEndKm !== null ? String(trip.odometerEndKm) : '',
  };

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href={returnTo} className="text-brand-700 text-sm font-semibold">
          {returnLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-ink font-mono text-xl font-black sm:text-2xl">
            {trip.tripNo ?? `운행 신청 #${trip.tripId}`}
          </h1>
          <StatusBadge status={trip.tripStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <CompanyVehicleTripInfoCard
            tripId={trip.tripId}
            editable={editable}
            initial={editableFields}
            readOnly={{
              employeeText: `${trip.employee.name} (${trip.employee.departmentName})`,
              employeeEmail: trip.employee.email,
              createdAtText: formatKstDateTime(trip.createdAt),
            }}
          />

          <CompanyVehicleTripScheduleCard
            tripId={trip.tripId}
            editable={editable}
            initial={editableFields}
            vehicles={vehicles}
            readOnly={{
              visitRangeText: formatKstRange(trip.requestStartAt, trip.requestEndAt),
              assignedVehicleText: trip.assignedVehicle?.vehicleNo ?? '미배정',
              actualEntryText: trip.actualEntryAt ? formatKstDateTime(trip.actualEntryAt) : '-',
              actualExitText: trip.actualExitAt ? formatKstDateTime(trip.actualExitAt) : '-',
              rejectionReason: trip.rejectionReason,
              cancelReason: trip.cancelReason,
            }}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <CompanyVehicleTripActionPanel
            tripId={trip.tripId}
            tripStatus={trip.tripStatus}
            vehicles={vehicles}
            entryExitManagementEnabled={settings.entryExitManagementEnabled}
          />

          <CompanyVehicleTripMileageCard
            tripId={trip.tripId}
            editable={editable}
            initial={editableFields}
          />
        </div>
      </div>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">상태 변경 이력</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>변경</th>
                  <th>주체</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {trip.statusLogs.map((log) => (
                  <tr key={log.statusLogId}>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstDateTime(log.createdAt)}
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {log.previousStatus
                        ? `${RESERVATION_STATUS_LABEL[log.previousStatus]} → `
                        : ''}
                      <strong>{RESERVATION_STATUS_LABEL[log.currentStatus]}</strong>
                    </td>
                    <td className="text-xs">
                      {log.changedByType === 'ADMIN'
                        ? `관리자${log.changedByAdmin?.adminName ? ` (${log.changedByAdmin.adminName})` : ''}`
                        : log.changedByType === 'REQUESTER'
                          ? '신청자'
                          : '시스템'}
                    </td>
                    <td className="text-xs">{log.changeReason ?? '-'}</td>
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
