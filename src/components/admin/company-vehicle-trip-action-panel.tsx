'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

type Props = {
  tripId: number;
  tripStatus: string;
};

export function CompanyVehicleTripActionPanel({ tripId, tripStatus }: Props) {
  const router = useRouter();
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  const [confirmMemo, setConfirmMemo] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  /** 다섯 액션(승인/반려/취소/미사용/반납확정) 전부 성공하면 대시보드로 돌아간다. */
  async function run(action: string, url: string, body?: unknown) {
    setPending(action);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      router.push('/admin');
      return;
    }

    setPending(null);
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  const canApprove = tripStatus === 'REQUESTED';
  const canReject = tripStatus === 'REQUESTED';
  const canCancel = tripStatus === 'APPROVED';
  const canMarkNoShow = tripStatus === 'APPROVED';
  const canConfirmReturn = tripStatus === 'PARKING';

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.variant === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      {canConfirmReturn && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">반납 확정</h2>
            <p className="text-sm text-slate-600">
              신청 직원이 반납 처리를 완료했습니다. 차량 상태를 확인한 뒤 반납을 확정해 주세요.
            </p>
            <FormField
              label="비고 (선택)"
              htmlFor="trip-confirm-memo"
              hint="차량 상태 확인 결과를 남길 수 있습니다."
              errors={fieldErrors.confirmMemo}
            >
              <textarea
                id="trip-confirm-memo"
                rows={2}
                className={inputClassName(Boolean(fieldErrors.confirmMemo))}
                value={confirmMemo}
                onChange={(event) => setConfirmMemo(event.target.value)}
                maxLength={500}
              />
            </FormField>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending !== null}
              onClick={() =>
                run(
                  'confirm-return',
                  `/api/admin/company-vehicle-trips/${tripId}/confirm-return`,
                  { confirmMemo: confirmMemo.trim() || undefined },
                )
              }
            >
              {pending === 'confirm-return' ? '처리 중…' : '반납 확정'}
            </button>
          </div>
        </section>
      )}

      {canApprove && (
        <section className="card">
          <div className="card-body space-y-4">
            <h2 className="card-title">승인</h2>
            <p className="text-sm text-slate-600">
              신청 직원이 선택한 차량·시간대로 승인합니다. 차량은 신청 시점에 이미 정해져 있어
              따로 배정하지 않습니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending !== null}
                onClick={() =>
                  run('approve', `/api/admin/company-vehicle-trips/${tripId}/approve`)
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
              승인 완료 이후 신청을 대신 취소합니다. 취소하면 되돌릴 수 없습니다.
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
                run('cancel', `/api/admin/company-vehicle-trips/${tripId}/cancel`, { cancelReason })
              }
            >
              {pending === 'cancel' ? '취소 처리 중…' : '신청 취소 확정'}
            </button>
          </div>
        </section>
      )}

      {canMarkNoShow && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">미사용 처리</h2>
            <p className="text-sm text-slate-600">
              승인은 났지만 직원이 차량을 가져가지 않은 경우 미사용으로 처리합니다. 처리하면
              되돌릴 수 없습니다.
            </p>
            <FormField
              label="처리 사유 (선택)"
              htmlFor="trip-no-show-reason"
              errors={fieldErrors.reason}
            >
              <textarea
                id="trip-no-show-reason"
                rows={2}
                className={inputClassName(Boolean(fieldErrors.reason))}
                value={noShowReason}
                onChange={(event) => setNoShowReason(event.target.value)}
                maxLength={500}
              />
            </FormField>
            <button
              type="button"
              className="btn btn-danger-outline"
              disabled={pending !== null}
              onClick={() =>
                run('no-show', `/api/admin/company-vehicle-trips/${tripId}/no-show`, {
                  reason: noShowReason.trim() || undefined,
                })
              }
            >
              {pending === 'no-show' ? '처리 중…' : '미사용 처리'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
