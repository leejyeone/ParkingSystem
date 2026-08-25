'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';
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
  /** 승인 완료 안내에 표시할 예약번호 */
  reservationNo: string;
  reservationStatus: string;
  /** 화면 진입 시점에 고른 기본 배정 위치. 드롭다운의 초기값으로만 쓴다. */
  defaultSpaceId: number | null;
  assignedSpaceId: number | null;
  availableSpaces: SpaceOption[];
  /** 시스템 설정의 주차면 배정 사용 여부. false 면 위치 선택 UI 자체를 감춘다. */
  spaceAssignmentEnabled: boolean;
  /** 배정을 쓰지 않을 때의 정원 사용 현황. 배정을 쓰면 null. */
  capacityUsage: { used: number; capacity: number; remaining: number } | null;
  /** 시스템 설정의 입·출차/미방문 처리 사용 여부. false 면 [입·출차 처리] 영역을 감춘다. */
  entryExitManagementEnabled: boolean;
};

export function ReservationActionPanel({
  reservationId,
  reservationNo,
  reservationStatus,
  defaultSpaceId,
  assignedSpaceId,
  availableSpaces,
  spaceAssignmentEnabled,
  capacityUsage,
  entryExitManagementEnabled,
}: Props) {
  const router = useRouter();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    String(assignedSpaceId ?? defaultSpaceId ?? ''),
  );
  const [rejectionReason, setRejectionReason] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  // 버튼을 누른 시각이 아니라 관리자가 확인한 실제 입/출차 시각을 입력받는다. 기본값은
  // "지금"이지만 자유롭게 고쳐서 늦게 입력해도 실제 시각을 기록할 수 있게 한다.
  const [entryTime, setEntryTime] = useState(() => utcToZonedInput(new Date()));
  const [exitTime, setExitTime] = useState(() => utcToZonedInput(new Date()));
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const hasAvailableSpace = availableSpaces.some((space) => space.available);
  const selectedSpace = availableSpaces.find((space) => String(space.spaceId) === selectedSpaceId);
  const isDoubleSelected = selectedSpace?.spaceType === 'DOUBLE';

  async function run(
    action: string,
    url: string,
    method: 'POST' | 'PUT',
    body?: unknown,
    options: { redirectTo?: string } = {},
  ) {
    setPending(action);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      // 처리를 끝내고 다음 건으로 넘어가는 흐름이면 목록으로 돌려보낸다.
      if (options.redirectTo) {
        router.push(options.redirectTo);
        router.refresh();
        return; // 화면이 곧 바뀌므로 pending 을 풀지 않아 버튼 재클릭을 막는다.
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

  const canApprove = reservationStatus === 'REQUESTED';
  const canReject = reservationStatus === 'REQUESTED';
  const canChangeSpace =
    spaceAssignmentEnabled && (reservationStatus === 'APPROVED' || reservationStatus === 'PARKING');
  // 입·출차/미방문 처리는 시스템 설정에서 껐으면 영역 자체를 감춘다.
  const canEntry = entryExitManagementEnabled && reservationStatus === 'APPROVED';
  const canExit = entryExitManagementEnabled && reservationStatus === 'PARKING';
  const canNoShow = entryExitManagementEnabled && reservationStatus === 'APPROVED';
  const isTerminal = ['REJECTED', 'CANCELLED', 'EXITED', 'NO_SHOW'].includes(reservationStatus);

  /*
   * 배정할 자리가 하나도 없으면 주차면 선택과 승인 버튼을 아예 감춘다.
   * 눌러도 서버에서 NO_AVAILABLE_SPACE 로 막히므로, 누를 수 있게 두면
   * 실패할 걸 알면서 시도하게 만드는 셈이다. 안내만 남기고 반려로 유도한다.
   */
  const canAssignSpace = !spaceAssignmentEnabled || hasAvailableSpace;

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
            <h2 className="card-title">{spaceAssignmentEnabled ? '주차면 배정' : '승인'}</h2>

            {!spaceAssignmentEnabled &&
              (capacityUsage && capacityUsage.remaining === 0 ? (
                <Alert variant="warning" title="정원이 모두 찼습니다">
                  이 시간대에 이미 {capacityUsage.used}대가 배정되어 정원(
                  {capacityUsage.capacity}대)을 채웠습니다. 승인을 시도하면 차단됩니다. 시간 조정을
                  요청하거나 반려 처리해 주세요.
                </Alert>
              ) : (
                <Alert variant="info" title="주차면 배정을 사용하지 않습니다">
                  주차 위치를 지정하지 않고 승인합니다.
                  {capacityUsage
                    ? ` 이 시간대 정원 ${capacityUsage.capacity}대 중 ${capacityUsage.used}대 사용, ${capacityUsage.remaining}대 남았습니다.`
                    : ''}
                </Alert>
              ))}

            {spaceAssignmentEnabled && !hasAvailableSpace && (
              <Alert variant="warning" title="배정 가능한 주차면이 없습니다">
                해당 시간대에 비어 있는 주차면이 없습니다. 시간 조정을 요청하거나 반려 처리해
                주세요.
              </Alert>
            )}

            {spaceAssignmentEnabled && canAssignSpace && (
              <FormField
                label="배정할 주차면"
                htmlFor="space-select"
                required
                errors={fieldErrors.spaceId}
                hint="비어 있는 주차면만 표시됩니다."
              >
                <select
                  id="space-select"
                  className={inputClassName(Boolean(fieldErrors.spaceId))}
                  value={selectedSpaceId}
                  onChange={(event) => setSelectedSpaceId(event.target.value)}
                >
                  {availableSpaces
                    .filter((space) => space.available)
                    .map((space) => (
                      <option key={space.spaceId} value={space.spaceId}>
                        {space.spaceCode} · {SPACE_TYPE_LABEL[space.spaceType]} · {space.areaName}
                      </option>
                    ))}
                </select>
              </FormField>
            )}

            {spaceAssignmentEnabled && canAssignSpace && isDoubleSelected && (
              <Alert variant="warning" title="⚠ 이중주차 위치를 선택했습니다">
                승인 시 신청자에게 이중주차 안내 메일이 추가 발송됩니다.
              </Alert>
            )}

            {canAssignSpace && (
              <div className="grid gap-2 sm:grid-cols-2">
                {canApprove && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending !== null}
                    onClick={() =>
                      run(
                        'approve',
                        `/api/admin/reservations/${reservationId}/approve`,
                        'POST',
                        {
                          spaceId:
                            spaceAssignmentEnabled && selectedSpaceId
                              ? Number(selectedSpaceId)
                              : null,
                        },
                        {
                          redirectTo: `/admin/reservations?status=REQUESTED&approved=${encodeURIComponent(reservationNo)}`,
                        },
                      )
                    }
                  >
                    {pending === 'approve'
                      ? '승인 중…'
                      : spaceAssignmentEnabled
                        ? '승인 및 위치 확정'
                        : '승인'}
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
            )}
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
                run(
                  'reject',
                  `/api/admin/reservations/${reservationId}/reject`,
                  'POST',
                  { rejectionReason },
                  {
                    redirectTo: `/admin/reservations?status=REQUESTED&rejected=${encodeURIComponent(reservationNo)}`,
                  },
                )
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
            {canEntry && (
              <div>
                <FormField
                  label="실제 입차 시각"
                  htmlFor="entry-time"
                  errors={fieldErrors.actualEntryAt}
                >
                  <input
                    id="entry-time"
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
                    run('entry', `/api/admin/reservations/${reservationId}/entry`, 'POST', {
                      actualEntryAt: entryTime,
                    })
                  }
                >
                  {pending === 'entry' ? '처리 중…' : '입차 처리'}
                </button>
              </div>
            )}
            {canExit && (
              <div className={canEntry ? 'border-t border-slate-100 pt-3' : undefined}>
                <FormField
                  label="실제 출차 시각"
                  htmlFor="exit-time"
                  errors={fieldErrors.actualExitAt}
                >
                  <input
                    id="exit-time"
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
                    run('exit', `/api/admin/reservations/${reservationId}/exit`, 'POST', {
                      actualExitAt: exitTime,
                    })
                  }
                >
                  {pending === 'exit' ? '처리 중…' : '출차 처리'}
                </button>
              </div>
            )}

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
                  {pending === 'no-show' ? '처리 중…' : '미방문 처리'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
