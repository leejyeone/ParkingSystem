'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

type VehicleOption = { vehicleId: number; vehicleNo: string; isActive: boolean };

type Props = {
  tripId: number;
  tripStatus: string;
  vehicles: VehicleOption[];
  entryExitManagementEnabled: boolean;
};

export function CompanyVehicleTripActionPanel({
  tripId,
  tripStatus,
  vehicles,
  entryExitManagementEnabled,
}: Props) {
  const router = useRouter();
  const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    String(activeVehicles[0]?.vehicleId ?? ''),
  );
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [entryTime, setEntryTime] = useState(() => utcToZonedInput(new Date()));
  const [exitTime, setExitTime] = useState(() => utcToZonedInput(new Date()));
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useDismissOnInteraction(Boolean(message), () => setMessage(null));

  async function run(action: string, url: string, body?: unknown, redirectTo?: string) {
    setPending(action);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }
      setPending(null);
      setMessage({ variant: 'success', text: '처리되었습니다.' });
      router.refresh();
      return;
    }

    setPending(null);
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  const canApprove = tripStatus === 'REQUESTED';
  const canReject = tripStatus === 'REQUESTED';
  const canCancel = tripStatus === 'APPROVED';
  const canEntry = entryExitManagementEnabled && tripStatus === 'APPROVED';
  const canExit = entryExitManagementEnabled && tripStatus === 'PARKING';
  const isTerminal = ['REJECTED', 'CANCELLED', 'EXITED', 'NO_SHOW'].includes(tripStatus);

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.variant === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      {isTerminal && (
        <Alert variant="info">종료된 운행 신청입니다. 더 이상 상태를 변경할 수 없습니다.</Alert>
      )}

      {(canEntry || canExit) && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">입·출차 처리</h2>
            {canEntry && (
              <div>
                <FormField
                  label="실제 입차 시각"
                  htmlFor="trip-entry-time"
                  errors={fieldErrors.actualEntryAt}
                >
                  <input
                    id="trip-entry-time"
                    type="datetime-local"
                    className={inputClassName(Boolean(fieldErrors.actualEntryAt))}
                    value={entryTime}
                    onChange={(event) => setEntryTime(event.target.value)}
                  />
                </FormField>
                <button
                  type="button"
                  className="btn btn-primary mt-3"
                  disabled={pending !== null}
                  onClick={() =>
                    run(
                      'entry',
                      `/api/admin/company-vehicle-trips/${tripId}/entry`,
                      { actualEntryAt: entryTime },
                      '/admin/company-vehicles/trips',
                    )
                  }
                >
                  {pending === 'entry' ? '처리 중…' : '입차 처리'}
                </button>
              </div>
            )}
            {canExit && (
              <div className={canEntry ? 'border-line-muted border-t pt-3' : undefined}>
                <FormField
                  label="실제 출차 시각"
                  htmlFor="trip-exit-time"
                  errors={fieldErrors.actualExitAt}
                >
                  <input
                    id="trip-exit-time"
                    type="datetime-local"
                    className={inputClassName(Boolean(fieldErrors.actualExitAt))}
                    value={exitTime}
                    onChange={(event) => setExitTime(event.target.value)}
                  />
                </FormField>
                <button
                  type="button"
                  className="btn btn-primary mt-3"
                  disabled={pending !== null}
                  onClick={() =>
                    run(
                      'exit',
                      `/api/admin/company-vehicle-trips/${tripId}/exit`,
                      { actualExitAt: exitTime },
                      '/admin/company-vehicles/trips',
                    )
                  }
                >
                  {pending === 'exit' ? '처리 중…' : '출차 처리'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {canApprove && (
        <section className="card">
          <div className="card-body space-y-4">
            <h2 className="card-title">차량 배정</h2>

            {activeVehicles.length === 0 ? (
              <Alert variant="warning" title="배정 가능한 법인차량이 없습니다">
                법인차량 관리에서 활성 차량을 등록해 주세요.
              </Alert>
            ) : (
              <FormField
                label="배정할 차량"
                htmlFor="vehicle-select"
                required
                errors={fieldErrors.vehicleId}
              >
                <select
                  id="vehicle-select"
                  className={inputClassName(Boolean(fieldErrors.vehicleId))}
                  value={selectedVehicleId}
                  onChange={(event) => setSelectedVehicleId(event.target.value)}
                >
                  {activeVehicles.map((vehicle) => (
                    <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                      {vehicle.vehicleNo}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending !== null || activeVehicles.length === 0 || !selectedVehicleId}
                onClick={() =>
                  run(
                    'approve',
                    `/api/admin/company-vehicle-trips/${tripId}/approve`,
                    { vehicleId: Number(selectedVehicleId) },
                    '/admin/company-vehicles/trips',
                  )
                }
              >
                {pending === 'approve' ? '승인 중…' : '승인'}
              </button>
            </div>
          </div>
        </section>
      )}

      {canReject && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">반려</h2>
            <FormField
              label="반려 사유"
              htmlFor="trip-rejection-reason"
              required
              errors={fieldErrors.rejectionReason}
            >
              <textarea
                id="trip-rejection-reason"
                rows={2}
                className={inputClassName(Boolean(fieldErrors.rejectionReason))}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength={500}
              />
            </FormField>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={pending !== null || rejectionReason.trim() === ''}
                onClick={() =>
                  run(
                    'reject',
                    `/api/admin/company-vehicle-trips/${tripId}/reject`,
                    { rejectionReason },
                    '/admin/company-vehicles/trips',
                  )
                }
              >
                {pending === 'reject' ? '반려 중…' : '반려 처리'}
              </button>
            </div>
          </div>
        </section>
      )}

      {canCancel && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">신청 취소</h2>
            <p className="text-sm text-slate-600">
              승인 완료 이후 신청을 대신 취소합니다. 취소하면 배정된 차량이 해제되며 되돌릴 수
              없습니다.
            </p>
            <FormField
              label="취소 사유"
              htmlFor="trip-cancel-reason"
              required
              errors={fieldErrors.cancelReason}
            >
              <textarea
                id="trip-cancel-reason"
                rows={2}
                className={inputClassName(Boolean(fieldErrors.cancelReason))}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={500}
              />
            </FormField>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending !== null || cancelReason.trim() === ''}
              onClick={() =>
                run(
                  'cancel',
                  `/api/admin/company-vehicle-trips/${tripId}/cancel`,
                  { cancelReason },
                  '/admin/company-vehicles/trips',
                )
              }
            >
              {pending === 'cancel' ? '취소 처리 중…' : '신청 취소 확정'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
