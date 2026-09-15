'use client';

import type { SpaceType } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { ParkingSpacePicker } from '@/components/admin/parking-space-picker';
import { ParkingMap } from '@/components/parking-map';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';
import { SPACE_TYPE_LABEL } from '@/domain/reservation-status';

type SpaceOption = {
  spaceId: number;
  spaceCode: string;
  spaceType: SpaceType;
  areaId: number;
  areaCode: string;
  areaName: string;
  available: boolean;
};

type Props = {
  reservationId: number;
  /** 승인/반려/취소 완료 안내에 표시할 예약번호 */
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
  const [cancelReason, setCancelReason] = useState('');
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
  const [spaceSelectOpen, setSpaceSelectOpen] = useState(false);
  // 이미 배정된 자리를 바꾸는 경우에만 쓴다 — [주차 위치 변경]을 눌러야 드롭다운이 열린다.
  // 처음 승인하며 배정하는 경우(canApprove)는 바꿀 기존 배정이 없으므로 항상 바로 연다.
  const [editingSpace, setEditingSpace] = useState(false);

  useDismissOnInteraction(Boolean(message), () => setMessage(null));
  useDismissOnInteraction(spaceSelectOpen, () => setSpaceSelectOpen(false));

  const hasAvailableSpace = availableSpaces.some((space) => space.available);
  const selectedSpace = availableSpaces.find((space) => String(space.spaceId) === selectedSpaceId);
  const isDoubleSelected = selectedSpace?.spaceType === 'DOUBLE';

  // 평면도 클릭 선택 UI는 구역별로 묶어서 넘겨야 한다 — 서비스 응답은 평면(flat) 목록이다.
  const areaGroups = useMemo(() => {
    const groups = new Map<
      number,
      { areaId: number; areaCode: string; areaName: string; spaces: SpaceOption[] }
    >();
    for (const space of availableSpaces) {
      const group = groups.get(space.areaId);
      if (group) {
        group.spaces.push(space);
      } else {
        groups.set(space.areaId, {
          areaId: space.areaId,
          areaCode: space.areaCode,
          areaName: space.areaName,
          spaces: [space],
        });
      }
    }
    return [...groups.values()];
  }, [availableSpaces]);

  async function run(
    action: string,
    url: string,
    method: 'POST' | 'PUT',
    body?: unknown,
    options: { redirectTo?: string; onSuccess?: () => void } = {},
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
        // 이 프로젝트의 관리자 페이지는 전부 force-dynamic이라 push만으로도 최신 데이터를
        // 다시 가져온다 — router.refresh()까지 같이 부르면 같은 RSC 요청이 중복으로 나가서
        // 서로 DB 커넥션을 기다리며 화면 전환이 오히려 느려진다.
        router.push(options.redirectTo);
        return; // 화면이 곧 바뀌므로 pending 을 풀지 않아 버튼 재클릭을 막는다.
      }
      setPending(null);
      setMessage({ variant: 'success', text: '처리되었습니다.' });
      options.onSuccess?.();
      router.refresh();
      return;
    }

    setPending(null);
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  const canApprove = reservationStatus === 'REQUESTED';
  const canReject = reservationStatus === 'REQUESTED';
  // 승인 완료 이후에는 신청자가 직접 취소할 수 없다(REQUESTER_MODIFIABLE_STATUSES).
  // 담당자에게 연락이 오면 관리자가 대신 취소 처리한다.
  const canCancel = reservationStatus === 'APPROVED';
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
                    run(
                      'entry',
                      `/api/admin/reservations/${reservationId}/entry`,
                      'POST',
                      { actualEntryAt: entryTime },
                      { redirectTo: '/admin' },
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
                    run(
                      'exit',
                      `/api/admin/reservations/${reservationId}/exit`,
                      'POST',
                      { actualExitAt: exitTime },
                      { redirectTo: '/admin' },
                    )
                  }
                >
                  {pending === 'exit' ? '처리 중…' : '출차 처리'}
                </button>
              </div>
            )}

            {canNoShow && (
              <div className="border-line-muted border-t pt-3">
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
                    run(
                      'no-show',
                      `/api/admin/reservations/${reservationId}/no-show`,
                      'POST',
                      { reason: noShowReason || null },
                      { redirectTo: '/admin' },
                    )
                  }
                >
                  {pending === 'no-show' ? '처리 중…' : '미방문 처리'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {(canApprove || canChangeSpace) && (
        <section className="card">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title">{spaceAssignmentEnabled ? '주차면 배정' : '승인'}</h2>
              {/* 이미 배정된 자리를 바꾸는 경우에만 토글이 필요하다 — 처음 배정하며
                  승인하는 경우(canApprove)는 바꿀 기존 배정이 없다. */}
              {spaceAssignmentEnabled && canChangeSpace && hasAvailableSpace && (
                <>
                  {editingSpace ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        disabled={pending !== null}
                        onClick={() => {
                          setSelectedSpaceId(String(assignedSpaceId ?? defaultSpaceId ?? ''));
                          setSpaceSelectOpen(false);
                          setEditingSpace(false);
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                        disabled={pending !== null || !selectedSpaceId}
                        onClick={() =>
                          run(
                            'space',
                            `/api/admin/reservations/${reservationId}/space`,
                            'PUT',
                            { spaceId: Number(selectedSpaceId) },
                            { onSuccess: () => setEditingSpace(false) },
                          )
                        }
                      >
                        {pending === 'space' ? '변경 중…' : '저장'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                      onClick={() => setEditingSpace(true)}
                    >
                      주차 위치 변경
                    </button>
                  )}
                </>
              )}
            </div>

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

            {spaceAssignmentEnabled && canChangeSpace && !editingSpace && (
              <div>
                <p className="label">배정된 주차면</p>
                <p className="text-ink mt-1 text-sm font-bold">
                  {selectedSpace
                    ? `${selectedSpace.spaceCode} · ${SPACE_TYPE_LABEL[selectedSpace.spaceType]} · ${selectedSpace.areaName}`
                    : '-'}
                </p>
                {selectedSpace && (
                  <div className="mt-2">
                    <ParkingMap
                      highlightCode={selectedSpace.spaceCode}
                      highlightLabel={`배정된 주차 위치 ${selectedSpace.spaceCode}`}
                    />
                  </div>
                )}
              </div>
            )}

            {spaceAssignmentEnabled && canAssignSpace && (canApprove || editingSpace) && (
              <FormField
                label="배정할 주차면"
                htmlFor="space-select"
                required
                errors={fieldErrors.spaceId}
              >
                <ParkingSpacePicker
                  areas={areaGroups}
                  selectedSpaceId={selectedSpaceId ? Number(selectedSpaceId) : null}
                  onSelect={(space) =>
                    setSelectedSpaceId((current) =>
                      String(space.spaceId) === current ? '' : String(space.spaceId),
                    )
                  }
                />
                <div className="relative mt-2">
                  <button
                    id="space-select"
                    type="button"
                    className={`${inputClassName(Boolean(fieldErrors.spaceId))} flex items-center justify-between gap-2 text-left`}
                    aria-haspopup="listbox"
                    aria-expanded={spaceSelectOpen}
                    onClick={() => setSpaceSelectOpen((open) => !open)}
                  >
                    <span className={selectedSpace ? '' : 'text-ink-faint'}>
                      {selectedSpace
                        ? `${selectedSpace.spaceCode} · ${SPACE_TYPE_LABEL[selectedSpace.spaceType]} · ${selectedSpace.areaName}`
                        : '선택 안 함'}
                    </span>
                    <ChevronDownIcon />
                  </button>

                  {/*
                    네이티브 select 는 화면 아래쪽 공간이 부족하면 브라우저가 알아서 위로
                    펼치는데, 카드가 화면 하단에 걸릴 때 이 목록이 위로 열려 오히려 가리는
                    문제가 있었다. absolute + top-full 로 직접 그려서 항상 트리거 아래로만
                    펼치고, 화면보다 낮은 자리에 걸리면 카드/화면 스크롤로 대응하게 한다.
                  */}
                  {spaceSelectOpen && (
                    <ul
                      role="listbox"
                      className="border-line bg-surface absolute top-full left-0 z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-lg"
                    >
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedSpaceId === ''}
                          className={`hover:bg-surface-hover block w-full px-3 py-2 text-left text-sm ${
                            selectedSpaceId === '' ? 'text-brand-700 font-bold' : 'text-ink-faint'
                          }`}
                          onClick={() => {
                            setSelectedSpaceId('');
                            setSpaceSelectOpen(false);
                          }}
                        >
                          선택 안 함
                        </button>
                      </li>
                      {availableSpaces
                        .filter(
                          (space) => space.available || String(space.spaceId) === selectedSpaceId,
                        )
                        .map((space) => (
                          <li key={space.spaceId}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={String(space.spaceId) === selectedSpaceId}
                              className={`hover:bg-surface-hover block w-full px-3 py-2 text-left text-sm ${
                                String(space.spaceId) === selectedSpaceId
                                  ? 'text-brand-700 font-bold'
                                  : 'text-ink'
                              }`}
                              onClick={() => {
                                setSelectedSpaceId(String(space.spaceId));
                                setSpaceSelectOpen(false);
                              }}
                            >
                              {space.spaceCode} · {SPACE_TYPE_LABEL[space.spaceType]} ·{' '}
                              {space.areaName}
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </FormField>
            )}

            {spaceAssignmentEnabled &&
              canAssignSpace &&
              (canApprove || editingSpace) &&
              isDoubleSelected && (
                <Alert variant="warning" title="⚠ 이중주차 위치를 선택했습니다">
                  승인 시 신청자에게 이중주차 안내 메일이 추가 발송됩니다.
                </Alert>
              )}

            {canApprove && canAssignSpace && (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    pending !== null ||
                    (spaceAssignmentEnabled && canAssignSpace && !selectedSpaceId)
                  }
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
                  {pending === 'approve' ? '승인 중…' : '승인'}
                </button>
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
            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-danger btn-sm"
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
          </div>
        </section>
      )}

      {canCancel && (
        <section className="card">
          <div className="card-body space-y-3">
            <h2 className="card-title">예약 취소</h2>
            <p className="text-sm text-slate-600">
              승인 완료 이후에는 신청자가 직접 취소할 수 없습니다. 담당자 요청으로 대신 취소합니다.
              취소하면 배정된 주차 위치가 해제되며 되돌릴 수 없습니다.
            </p>
            <FormField
              label="취소 사유"
              htmlFor="cancel-reason"
              required
              hint="입력한 사유가 신청자에게 메일로 전달됩니다."
              errors={fieldErrors.cancelReason}
            >
              <textarea
                id="cancel-reason"
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
                  `/api/admin/reservations/${reservationId}/cancel`,
                  'POST',
                  { cancelReason },
                  {
                    redirectTo: `/admin/reservations?status=APPROVED&cancelled=${encodeURIComponent(reservationNo)}`,
                  },
                )
              }
            >
              {pending === 'cancel' ? '취소 처리 중…' : '예약 취소 확정'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}
