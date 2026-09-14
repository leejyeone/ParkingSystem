import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripCancelPanel } from '@/components/employee/company-vehicle-trip-cancel-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { formatKstDateTime, formatKstRange } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { parseNumericId } from '@/lib/api-helpers';
import { getCompanyVehicleTripDetail } from '@/services/company-vehicle-trip-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '법인차량 신청 상세' };

type PageProps = { params: Promise<{ id: string }> };

/** 직원의 법인차량 신청 상세 — 본인 신청만 열람할 수 있다(읽기 전용). */
export default async function EmployeeCompanyVehicleTripDetailPage({ params }: PageProps) {
  const session = await requireEmployeePage('/employee/reservations');
  const { id } = await params;

  let tripId: number;
  try {
    tripId = parseNumericId(id, '신청 ID');
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

  // 남의 신청 ID 를 넣은 경우도 "없음"으로 동일하게 처리한다.
  if (trip.employeeUserId !== session.employeeUserId) {
    notFound();
  }

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인차량 신청 상세</h1>
        <StatusBadge status={trip.tripStatus} />
      </div>

      <section className="card">
        <div className="card-body space-y-3">
          <h2 className="card-title">신청 정보</h2>
          <div className="definition-row">
            <dt className="definition-term">신청자</dt>
            <dd className="definition-desc">{trip.employee.name}</dd>
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
            <dd className="definition-desc">{formatKstRange(trip.requestStartAt, trip.requestEndAt)}</dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">배정 차량</dt>
            <dd className="definition-desc">{trip.assignedVehicle?.vehicleNo ?? '승인 후 배정'}</dd>
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

      {trip.tripStatus === 'REQUESTED' && <CompanyVehicleTripCancelPanel tripId={trip.tripId} />}

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">상태 변경 이력</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>변경</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {trip.statusLogs.map((log) => (
                  <tr key={log.statusLogId}>
                    <td className="text-xs whitespace-nowrap">{formatKstDateTime(log.createdAt)}</td>
                    <td className="text-xs">
                      {log.previousStatus ? `${RESERVATION_STATUS_LABEL[log.previousStatus]} → ` : ''}
                      <strong>{RESERVATION_STATUS_LABEL[log.currentStatus]}</strong>
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
