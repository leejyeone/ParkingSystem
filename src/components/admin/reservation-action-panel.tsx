'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { SPACE_TYPE_LABEL } from '@/domain/reservation-status';

type SpaceOption = {
  spaceId: number;
  spaceCode: string;
  spaceType: keyof typeof SPACE_TYPE_LABEL;
  areaName: string;
  available: boolean;
};

type Props = {
  reservationId: number;
  reservationStatus: string;
  recommendedSpaceId: number | null;
  recommendedSpaceCode: string | null;
  assignedSpaceId: number | null;
  availableSpaces: SpaceOption[];
};

export function ReservationActionPanel({
  reservationId,
  reservationStatus,
  recommendedSpaceId,
  recommendedSpaceCode,
  assignedSpaceId,
  availableSpaces,
}: Props) {
  const router = useRouter();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    String(assignedSpaceId ?? recommendedSpaceId ?? ''),
  );
  const [rejectionReason, setRejectionReason] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const selectedSpace = availableSpaces.find((space) => String(space.spaceId) === selectedSpaceId);
  const isDoubleSelected = selectedSpace?.spaceType === 'DOUBLE';

  async function run(action: string, url: string, method: 'POST' | 'PUT', body?: unknown) {
    setPending(action);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    setPending(null);

    if (response.ok) {
      setMessage({ variant: 'success', text: '처리되었습니다.' });
      router.refresh();
      return;
    }
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  const canApprove = reservationStatus === 'REQUESTED';
  const canReject = reservationStatus === 'REQUESTED';
  const canChangeSpace = reservationStatus === 'APPROVED' || reservationStatus === 'PARKING';
  const canEntry = reservationStatus === 'APPROVED';
  const canExit = reservationStatus === 'PARKING';
  const canNoShow = reservationStatus === 'APPROVED';
  const isTerminal = ['REJECTED', 'CANCELLED', 'EXITED', 'NO_SHOW'].includes(reservationStatus);

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.variant === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      {isTerminal && (
        <Alert variant="info">종료된 예약입니다. 더 이상 상태를 변경할 수 없습니다.</Alert>
      )}

      {(canApprove || canChangeSpace) && (
        <section className="card">
          <div className="card-body space-y-4">
            <h2 className="card-title">주차면 배정</h2>

            {recommendedSpaceCode ? (
              <Alert variant="info" title="시스템 추천 위치">
                {recommendedSpaceCode} — 관리자가 다른 위치로 변경할 수 있습니다.
              </Alert>
            ) : (
              <Alert variant="warning" title="추천 가능한 위치가 없습니다">
                해당 시간대에 비어 있는 주차면이 없습니다. 시간 조정을 요청하거나 반려 처리해
                주세요.
              </Alert>
            )}

            <FormField
              label="배정할 주차면"
              htmlFor="space-select"
              required
              errors={fieldErrors.spaceId}
              hint="사용 중인 주차면은 선택할 수 없습니다."
            >
              <select
                id="space-select"
                className={inputClassName(Boolean(fieldErrors.spaceId))}
                value={selectedSpaceId}
                onChange={(event) => setSelectedSpaceId(event.target.value)}
              >
                <option value="">선택 안 함 (추천 위치 사용)</option>
                {availableSpaces.map((space) => (
                  <option key={space.spaceId} value={space.spaceId} disabled={!space.available}>
                    {space.spaceCode} · {SPACE_TYPE_LABEL[space.spaceType]} · {space.areaName}
                    {space.available ? '' : ' (사용 중)'}
                  </option>
                ))}
              </select>
            </FormField>

            {isDoubleSelected && (
              <Alert variant="warning" title="⚠ 이중주차 위치를 선택했습니다">
                승인 시 신청자에게 이중주차 안내 메일이 추가 발송됩니다.
              </Alert>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {canApprove && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending !== null}
                  onClick={() =>
                    run('approve', `/api/admin/reservations/${reservationId}/approve`, 'POST', {
                      spaceId: selectedSpaceId ? Number(selectedSpaceId) : null,
                    })
                  }
                >
                  {pending === 'approve' ? '승인 중…' : '승인 및 위치 확정'}
                </button>
              )}
              {canChangeSpace && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pending !== null || !selectedSpaceId}
                  onClick={() =>
                    run('space', `/api/admin/reservations/${reservationId}/space`, 'PUT', {
                      spaceId: Number(selectedSpaceId),
                    })
                  }
                >
                  {pending === 'space' ? '변경 중…' : '주차 위치 변경'}
                </button>
              )}
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
              htmlFor="rejection-reason"
              required
              hint="입력한 사유가 신청자에게 메일로 전달됩니다."
              errors={fieldErrors.rejectionReason}
            >
              <textarea
                id="rejection-reason"
                rows={2}
                className={inputClassName(Boolean(fieldErrors.rejectionReason))}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength={500}
              />
            </FormField>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending !== null || rejectionReason.trim() === ''}
              onClick={() =>
                run('reject', `/api/admin/reservations/${reservationId}/reject`, 'POST', {
                  rejectionReason,
                })
              }
            >
              {pending === 'reject' ? '반려 중…' : '반려 처리'}
            </button>
          </div>
        </section>
      )}

      {(canEntry || canExit || canNoShow) && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">입·출차 처리</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {canEntry && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending !== null}
                  onClick={() =>
                    run('entry', `/api/admin/reservations/${reservationId}/entry`, 'POST')
                  }
                >
                  {pending === 'entry' ? '처리 중…' : '입차 처리'}
                </button>
              )}
              {canExit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending !== null}
                  onClick={() =>
                    run('exit', `/api/admin/reservations/${reservationId}/exit`, 'POST')
                  }
                >
                  {pending === 'exit' ? '처리 중…' : '출차 처리'}
                </button>
              )}
            </div>

            {canNoShow && (
              <div className="border-t border-slate-100 pt-3">
                <FormField
                  label="미방문 처리 사유"
                  htmlFor="no-show-reason"
                  errors={fieldErrors.reason}
                >
                  <input
                    id="no-show-reason"
                    className={inputClassName(Boolean(fieldErrors.reason))}
                    value={noShowReason}
                    onChange={(event) => setNoShowReason(event.target.value)}
                    placeholder="선택 입력 (예: 예약 시간 종료 후 미입차)"
                    maxLength={500}
                  />
                </FormField>
                <button
                  type="button"
                  className="btn btn-secondary mt-3"
                  disabled={pending !== null}
                  onClick={() =>
                    run('no-show', `/api/admin/reservations/${reservationId}/no-show`, 'POST', {
                      reason: noShowReason || null,
                    })
                  }
                >
                  {pending === 'no-show' ? '처리 중…' : '미방문(NO_SHOW) 처리'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
