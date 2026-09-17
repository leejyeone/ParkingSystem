import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripCancelPanel } from '@/components/employee/company-vehicle-trip-cancel-panel';
import { CompanyVehicleTripMileagePanel } from '@/components/employee/company-vehicle-trip-mileage-panel';
import { CompanyVehicleTripReturnPanel } from '@/components/employee/company-vehicle-trip-return-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  COMPANY_VEHICLE_STATUS_LABEL,
  resolveCompanyVehicleDisplayStatus,
} from '@/domain/reservation-status';
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

  // 입출차 관리가 없어져서 "지금 사용 중인지/기간이 지났는지"는 신청 시간만 보고
  // 추측할 수밖에 없다(resolveCompanyVehicleDisplayStatus, reservation-status.ts 참고).
  // 관리자 화면과 달리 직원 본인 화면에서는 이 파생 상태를 보여준다.
  const displayStatus = resolveCompanyVehicleDisplayStatus(trip);

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인 차량 예약</h1>
      </div>

      <section className="card">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-ink-faint text-xs font-bold">신청번호</p>
              <p className="text-ink font-mono text-lg font-black">
                {trip.tripNo ?? `운행 신청 #${trip.tripId}`}
              </p>
            </div>
            <StatusBadge status={displayStatus} label={COMPANY_VEHICLE_STATUS_LABEL[displayStatus]} />
          </div>
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
            <dt className="definition-term">사용 차량</dt>
            <dd className="definition-desc">{trip.assignedVehicle?.vehicleNo ?? '-'}</dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">반납 처리 시각</dt>
            <dd className="definition-desc">
              {trip.actualEntryAt ? formatKstDateTime(trip.actualEntryAt) : '-'}
            </dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">반납 확정 시각</dt>
            <dd className="definition-desc">
              {trip.actualExitAt ? formatKstDateTime(trip.actualExitAt) : '-'}
            </dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">주행거리</dt>
            <dd className="definition-desc">
              {trip.odometerStartKm !== null && trip.odometerEndKm !== null
                ? `${trip.odometerEndKm - trip.odometerStartKm}km`
                : '-'}
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

      {trip.tripStatus === 'APPROVED' && (
        <CompanyVehicleTripMileagePanel
          tripId={trip.tripId}
          initial={{
            odometerStartKm: trip.odometerStartKm !== null ? String(trip.odometerStartKm) : '',
            odometerEndKm: trip.odometerEndKm !== null ? String(trip.odometerEndKm) : '',
            manualDistanceKm: trip.manualDistanceKm !== null ? String(trip.manualDistanceKm) : '',
          }}
        />
      )}

      {trip.tripStatus === 'APPROVED' && <CompanyVehicleTripReturnPanel tripId={trip.tripId} />}

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
                    <td className="text-xs whitespace-nowrap">
                      {log.previousStatus
                        ? `${COMPANY_VEHICLE_STATUS_LABEL[log.previousStatus]} → `
                        : ''}
                      <strong>{COMPANY_VEHICLE_STATUS_LABEL[log.currentStatus]}</strong>
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
