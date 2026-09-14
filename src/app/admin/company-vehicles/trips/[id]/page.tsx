import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripActionPanel } from '@/components/admin/company-vehicle-trip-action-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, formatKstRange } from '@/lib/datetime';
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

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/company-vehicles/trips" className="text-brand-700 text-sm font-semibold">
          ← 운행 신청 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-ink text-xl font-black sm:text-2xl">운행 신청 #{trip.tripId}</h1>
          <StatusBadge status={trip.tripStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section className="card">
            <div className="card-body space-y-3">
              <h2 className="card-title">신청 정보</h2>
              <div className="definition-row">
                <dt className="definition-term">신청 직원</dt>
                <dd className="definition-desc">
                  {trip.employee.name} ({trip.employee.departmentName})
                </dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">이메일</dt>
                <dd className="definition-desc">{trip.employee.email}</dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">행선지</dt>
                <dd className="definition-desc">{trip.destination}</dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">사유</dt>
                <dd className="definition-desc whitespace-pre-wrap">{trip.reason}</dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">신청 일시</dt>
                <dd className="definition-desc">{formatKstDateTime(trip.createdAt)}</dd>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-body space-y-3">
              <h2 className="card-title">운행 일정</h2>
              <div className="definition-row">
                <dt className="definition-term">운행 요청 시간</dt>
                <dd className="definition-desc">
                  {formatKstRange(trip.requestStartAt, trip.requestEndAt)}
                </dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">배정 차량</dt>
                <dd className="definition-desc">{trip.assignedVehicle?.vehicleNo ?? '미배정'}</dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">실제 입차</dt>
                <dd className="definition-desc">
                  {trip.actualEntryAt ? formatKstDateTime(trip.actualEntryAt) : '-'}
                </dd>
              </div>
              <div className="definition-row">
                <dt className="definition-term">실제 출차</dt>
                <dd className="definition-desc">
                  {trip.actualExitAt ? formatKstDateTime(trip.actualExitAt) : '-'}
                </dd>
              </div>
              {trip.rejectionReason && (
                <div className="definition-row">
                  <dt className="definition-term">반려 사유</dt>
                  <dd className="definition-desc">{trip.rejectionReason}</dd>
                </div>
              )}
              {trip.cancelReason && (
                <div className="definition-row">
                  <dt className="definition-term">취소 사유</dt>
                  <dd className="definition-desc">{trip.cancelReason}</dd>
                </div>
              )}
            </div>
          </section>
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
