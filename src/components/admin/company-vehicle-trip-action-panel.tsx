'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

type VehicleOption = {
  vehicleId: number;
  vehicleNo: string;
  isActive: boolean;
  /** 이 신청의 운행 시간대에 다른 신청과 겹치지 않아 배정 가능한지. */
  available: boolean;
};

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
  const searchParams = useSearchParams();
  const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive && vehicle.available);
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

  async function run(
    action: string,
    url: string,
    body?: unknown,
    opts?: {
      redirectTo?: string;
      successMessage?: string;
      /** 페이지 이동 없이, 현재 쿼리에 이 값들만 덧붙여 같은 페이지를 새로 불러온다. */
      appendQuery?: Record<string, string>;
    },
  ) {
    setPending(action);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      if (opts?.redirectTo) {
        router.push(opts.redirectTo);
        return;
      }
      setPending(null);
      setMessage({ variant: 'success', text: opts?.successMessage ?? '처리되었습니다.' });
      if (opts?.appendQuery) {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(opts.appendQuery)) params.set(key, value);
        // 쿼리만 바뀐 URL의 새 캐시 항목을 만드는 것과 별개로, 쿼리 없는 원래 상세 페이지
        // URL의 라우터 캐시도 갱신해야 한다 — 안 그러면 계기판 입력 후 목록으로 나갔다가
        // 다시 들어왔을 때 이 캐시가 처리 이전 상태로 남아 있을 수 있다.
        router.refresh();
        router.replace(`?${params.toString()}`);
      } else {
        router.refresh();
      }
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
            <h2 className="card-title">출·입차 처리</h2>
            {canEntry && (
              <div>
                {/* 법인차량은 승인 후 차가 먼저 나가므로, 이 처리(APPROVED→PARKING)는 실제로 "출차"다. */}
                <FormField
                  label="실제 출차 시각"
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
                      {
                        successMessage:
                          '출차 처리되었습니다. 아래 주행 기록에서 출발 전 계기판(또는 주행거리)을 입력해 주세요.',
                        appendQuery: { mileagePrompt: '1' },
                      },
                    )
                  }
                >
                  {pending === 'entry' ? '처리 중…' : '출차 처리'}
                </button>
              </div>
            )}
            {canExit && (
              <div className={canEntry ? 'border-line-muted border-t pt-3' : undefined}>
                {/* 이 처리(PARKING→EXITED)는 차가 돌아오는 "입차"다. */}
                <FormField
                  label="실제 입차 시각"
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
                      {
                        successMessage:
                          '입차 처리되었습니다. 아래 주행 기록에서 도착 후 계기판(또는 주행거리)을 입력해 주세요.',
                        appendQuery: { mileagePrompt: '1' },
                      },
                    )
                  }
                >
                  {pending === 'exit' ? '처리 중…' : '입차 처리'}
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
                    { redirectTo: '/admin' },
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
                    { redirectTo: '/admin' },
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
                  { redirectTo: '/admin' },
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
