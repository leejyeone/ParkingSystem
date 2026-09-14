import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripActionPanel } from '@/components/admin/company-vehicle-trip-action-panel';
import {
  CompanyVehicleTripInfoCard,
  CompanyVehicleTripScheduleCard,
} from '@/components/admin/company-vehicle-trip-detail-cards';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE,
  isTerminalStatus,
  RESERVATION_STATUS_LABEL,
} from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, formatKstRange, utcToZonedInput } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { parseNumericId } from '@/lib/api-helpers';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { getCompanyVehicleTripDetail } from '@/services/company-vehicle-trip-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '운행 신청 상세' };

type PageProps = { params: Promise<{ id: string }> };

export default async function CompanyVehicleTripDetailPage({ params }: PageProps) {
  await requireAdminPage('/admin/company-vehicles/trips');
  const { id } = await params;

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

  // 종료된 신청(반려/취소/출차/미방문)은 내용을 바꿀 수 없다. 방문 예약 상세와 같은 기준.
  const editable = !isTerminalStatus(trip.tripStatus);
  const editableFields = {
    employeeUserId: trip.employeeUserId,
    employeeLabel: `${trip.employee.name} (${trip.employee.departmentName})`,
    destination: trip.destination,
    reason: trip.reason,
    requestStartAt: utcToZonedInput(trip.requestStartAt),
    requestEndAt: utcToZonedInput(trip.requestEndAt),
    odometerStartKm: trip.odometerStartKm !== null ? String(trip.odometerStartKm) : '',
    odometerEndKm: trip.odometerEndKm !== null ? String(trip.odometerEndKm) : '',
  };

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/company-vehicles/trips" className="text-brand-700 text-sm font-semibold">
          ← 운행 신청 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-ink font-mono text-xl font-black sm:text-2xl">
            {trip.tripNo ?? `운행 신청 #${trip.tripId}`}
          </h1>
          <StatusBadge
            status={trip.tripStatus}
            label={COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE[trip.tripStatus]}
          />
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

        <div className="min-w-0">
          <CompanyVehicleTripActionPanel
            tripId={trip.tripId}
            tripStatus={trip.tripStatus}
            vehicles={vehicles}
            entryExitManagementEnabled={settings.entryExitManagementEnabled}
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
                    <td className="text-xs">
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
