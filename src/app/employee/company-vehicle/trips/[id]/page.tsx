import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CompanyVehicleTripActionsPanel } from '@/components/employee/company-vehicle-trip-actions-panel';
import { CompanyVehicleTripMileagePanel } from '@/components/employee/company-vehicle-trip-mileage-panel';
import { CompanyVehicleTripReturnPanel } from '@/components/employee/company-vehicle-trip-return-panel';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  COMPANY_VEHICLE_STATUS_LABEL,
  resolveCompanyVehicleDisplayStatus,
} from '@/domain/reservation-status';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { earliestSelectableInput, formatKstDateTime, formatKstRange, utcToZonedInput } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { parseNumericId } from '@/lib/api-helpers';
import { getCompanyVehicleTripDetail } from '@/services/company-vehicle-trip-service';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { getSystemSettings } from '@/services/settings-service';

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

  // 수정·취소 패널(REQUESTED 상태만)은 신청 폼과 같은 설정값·초기값이 필요하다 —
  // 승인 대기가 아니면 아예 안 쓰이므로 그때만 불러온다.
  let actionsPanel: React.ReactNode = null;
  if (trip.tripStatus === 'REQUESTED' && trip.assignedVehicle) {
    const [profile, settings] = await Promise.all([
      getEmployeeProfile(session.employeeUserId),
      getSystemSettings(),
    ]);
    const startInput = utcToZonedInput(trip.requestStartAt);
    actionsPanel = (
      <CompanyVehicleTripActionsPanel
        tripId={trip.tripId}
        employeeName={profile?.name ?? session.name}
        minDateTimeInput={earliestSelectableInput(settings.reservationMinLeadMinutes)}
        reservationMinLeadMinutes={settings.reservationMinLeadMinutes}
        operatingStartTime={settings.companyVehicleOperatingStartTime}
        operatingEndTime={settings.companyVehicleOperatingEndTime}
        maxUsageHours={settings.companyVehicleMaxUsageHours}
        timingExceptionEnabled={settings.timingExceptionEnabled}
        initial={{
          destination: trip.destination,
          reason: trip.reason,
          vehicleId: trip.assignedVehicle.vehicleId,
          date: startInput.split('T')[0],
          requestStartAt: startInput,
          requestEndAt: utcToZonedInput(trip.requestEndAt),
          timingExceptionReason: trip.timingExceptionReason,
        }}
      />
    );
  }

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-ink text-xl font-black sm:text-2xl">법인 차량 예약</h1>
      </div>

      {trip.timingExceptionReason && (
        <Alert variant="warning" title="시간 예외 신청">
          운영 가능 시간·최대 사용시간 등 기본 제약을 벗어난 신청입니다.
        </Alert>
      )}

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
          <div className="definition-row">
            <dt className="definition-term">운행 요청 시간</dt>
            <dd className="definition-desc">{formatKstRange(trip.requestStartAt, trip.requestEndAt)}</dd>
          </div>
          {trip.timingExceptionReason && (
            <div className="definition-row">
              <dt className="definition-term">예외 신청 사유</dt>
              <dd className="definition-desc whitespace-pre-wrap">{trip.timingExceptionReason}</dd>
            </div>
          )}
          <div className="definition-row">
            <dt className="definition-term">사용 차량</dt>
            <dd className="definition-desc">{trip.assignedVehicle?.vehicleNo ?? '-'}</dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">주차 위치</dt>
            <dd className="definition-desc">{trip.assignedVehicle?.parkingSpace?.spaceCode ?? '-'}</dd>
          </div>
          {trip.tripStatus === 'APPROVED' && (
            <Alert variant="info">배정 차량 키는 관리실에서 수령해 주세요.</Alert>
          )}
          {/* 반납 처리/확정, 주행거리는 승인 전에는 의미가 없으므로 승인 완료 후에만 보여준다. */}
          {trip.approvedAt && (
            <>
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
            </>
          )}
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

      {actionsPanel}

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
    </main>
  );
}
