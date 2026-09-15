'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiRequest } from '@/lib/client/api-client';
import { formatKstDate, formatKstRange } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';
import type { DisplayReservationStatus } from '@/domain/reservation-status';

type Occurrence = {
  reservationId: number;
  reservationNo: string;
  visitStartAt: string;
  visitEndAt: string;
  displayStatus: DisplayReservationStatus;
  reservationStatus: string;
  assignedSpaceCode: string | null;
  companyOrBranchName: string;
  requesterName: string;
  vehicleNo: string;
};

type SpaceOption = { spaceId: number; spaceCode: string; areaName: string };

/** 관리자가 개별 날짜를 제외 처리할 수 있는 상태 — 아직 방문 전이고 살아있는 건만 대상이다. */
const SKIPPABLE_STATUSES = new Set(['REQUESTED', 'APPROVED']);
/** 더 이상 손댈 수 없는(수정·삭제 대상이 아닌) 종료 상태. */
const TERMINAL_STATUSES = new Set(['REJECTED', 'CANCELLED', 'EXITED', 'NO_SHOW']);

type BulkResultRow = { reservationNo: string; dateLabel: string; ok: boolean; message: string };

export function RecurringScheduleOccurrenceTable({
  occurrences,
  spaceOptions,
  returnTo,
}: {
  occurrences: Occurrence[];
  spaceOptions: SpaceOption[];
  /** 예약 상세에서 뒤로가기를 누르면 돌아올 이 반복 예약 상세의 URL */
  returnTo: string;
}) {
  const router = useRouter();
  const [skippingOccurrence, setSkippingOccurrence] = useState<Occurrence | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipSubmitting, setSkipSubmitting] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<BulkResultRow[] | null>(null);

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditStartTime, setBulkEditStartTime] = useState('');
  const [bulkEditEndTime, setBulkEditEndTime] = useState('');
  const [bulkEditSpaceId, setBulkEditSpaceId] = useState('');
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [bulkEditSubmitting, setBulkEditSubmitting] = useState(false);
  const [bulkEditResult, setBulkEditResult] = useState<BulkResultRow[] | null>(null);

  useDismissOnInteraction(Boolean(message), () => setMessage(null));

  const selectedOccurrences = occurrences.filter((occurrence) =>
    selected.has(occurrence.reservationId),
  );
  const allSelected = occurrences.length > 0 && selected.size === occurrences.length;

  function toggleOne(reservationId: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(reservationId)) next.delete(reservationId);
      else next.add(reservationId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(occurrences.map((o) => o.reservationId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openSkipPanel(occurrence: Occurrence) {
    setSkippingOccurrence(occurrence);
    setSkipReason('');
    setSkipError(null);
  }

  function closeSkipPanel() {
    setSkippingOccurrence(null);
    setSkipReason('');
    setSkipError(null);
  }

  async function submitSkip() {
    if (!skippingOccurrence) return;
    if (!skipReason.trim()) {
      setSkipError('제외 사유를 입력해 주세요.');
      return;
    }

    setSkipSubmitting(true);
    const response = await apiRequest(
      `/api/admin/reservations/${skippingOccurrence.reservationId}/skip-recurring`,
      { method: 'POST', body: JSON.stringify({ reason: skipReason.trim() }) },
    );
    setSkipSubmitting(false);

    if (!response.ok) {
      setSkipError(response.error.message);
      return;
    }

    closeSkipPanel();
    setMessage({ variant: 'success', text: '해당 날짜를 제외 처리했습니다.' });
    router.refresh();
  }

  function openBulkDelete() {
    setBulkDeleteReason('');
    setBulkDeleteError(null);
    setBulkDeleteResult(null);
    setBulkDeleteOpen(true);
  }

  function closeBulkDelete() {
    setBulkDeleteOpen(false);
    setBulkDeleteReason('');
    setBulkDeleteError(null);
    setBulkDeleteResult(null);
  }

  async function submitBulkDelete() {
    if (!bulkDeleteReason.trim()) {
      setBulkDeleteError('제외 사유를 입력해 주세요.');
      return;
    }
    setBulkDeleteSubmitting(true);
    setBulkDeleteError(null);

    const results = await Promise.all(
      selectedOccurrences.map(async (occurrence): Promise<BulkResultRow> => {
        const dateLabel = formatKstRange(
          new Date(occurrence.visitStartAt),
          new Date(occurrence.visitEndAt),
        );
        if (!SKIPPABLE_STATUSES.has(occurrence.reservationStatus)) {
          return {
            reservationNo: occurrence.reservationNo,
            dateLabel,
            ok: false,
            message: '현재 상태에서는 제외 처리할 수 없습니다.',
          };
        }
        const response = await apiRequest(
          `/api/admin/reservations/${occurrence.reservationId}/skip-recurring`,
          { method: 'POST', body: JSON.stringify({ reason: bulkDeleteReason.trim() }) },
        );
        return {
          reservationNo: occurrence.reservationNo,
          dateLabel,
          ok: response.ok,
          message: response.ok ? '제외 처리 완료' : response.error.message,
        };
      }),
    );

    setBulkDeleteSubmitting(false);
    setBulkDeleteResult(results);
    if (results.every((row) => row.ok)) clearSelection();
    router.refresh();
  }

  function openBulkEdit() {
    setBulkEditStartTime('');
    setBulkEditEndTime('');
    setBulkEditSpaceId('');
    setBulkEditError(null);
    setBulkEditResult(null);
    setBulkEditOpen(true);
  }

  function closeBulkEdit() {
    setBulkEditOpen(false);
    setBulkEditError(null);
    setBulkEditResult(null);
  }

  async function submitBulkEdit() {
    const timeChanged = Boolean(bulkEditStartTime || bulkEditEndTime);
    if (timeChanged && (!bulkEditStartTime || !bulkEditEndTime)) {
      setBulkEditError('매일 시작·종료 시간을 둘 다 입력해 주세요.');
      return;
    }
    if (timeChanged && bulkEditEndTime <= bulkEditStartTime) {
      setBulkEditError('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }
    if (!timeChanged && !bulkEditSpaceId) {
      setBulkEditError('변경할 시간 또는 주차면 중 하나는 입력해 주세요.');
      return;
    }

    setBulkEditSubmitting(true);
    setBulkEditError(null);

    const results = await Promise.all(
      selectedOccurrences.map(async (occurrence): Promise<BulkResultRow> => {
        const dateLabel = formatKstRange(
          new Date(occurrence.visitStartAt),
          new Date(occurrence.visitEndAt),
        );

        if (TERMINAL_STATUSES.has(occurrence.reservationStatus)) {
          return {
            reservationNo: occurrence.reservationNo,
            dateLabel,
            ok: false,
            message: '종료된 예약은 수정할 수 없습니다.',
          };
        }

        const notes: string[] = [];
        let hasError = false;

        if (timeChanged) {
          const dateStr = formatKstDate(new Date(occurrence.visitStartAt));
          const response = await apiRequest(`/api/admin/reservations/${occurrence.reservationId}`, {
            method: 'PUT',
            body: JSON.stringify({
              companyOrBranchName: occurrence.companyOrBranchName,
              requesterName: occurrence.requesterName,
              vehicleNo: occurrence.vehicleNo,
              visitStartAt: `${dateStr}T${bulkEditStartTime}`,
              visitEndAt: `${dateStr}T${bulkEditEndTime}`,
            }),
          });
          if (response.ok) {
            notes.push('시간 변경 완료');
          } else {
            hasError = true;
            notes.push(`시간 변경 실패: ${response.error.message}`);
          }
        }

        if (bulkEditSpaceId) {
          const response = await apiRequest(
            `/api/admin/reservations/${occurrence.reservationId}/space`,
            { method: 'PUT', body: JSON.stringify({ spaceId: Number(bulkEditSpaceId) }) },
          );
          if (response.ok) {
            notes.push('주차면 변경 완료');
          } else {
            hasError = true;
            notes.push(`주차면 변경 실패: ${response.error.message}`);
          }
        }

        return {
          reservationNo: occurrence.reservationNo,
          dateLabel,
          ok: !hasError,
          message: notes.join(' / '),
        };
      }),
    );

    setBulkEditSubmitting(false);
    setBulkEditResult(results);
    if (results.every((row) => row.ok)) clearSelection();
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-body">
        <h2 className="card-title">개별 예약</h2>
        <p className="field-hint">
          직원이 연차·출장 등으로 특정 날짜에 자리를 쓰지 않는다면, 그 날짜만 &quot;제외
          처리&quot;하거나 다른 주차면·시간대로 바꿀 수 있습니다 — 나머지 일정은 그대로
          유지됩니다. 여러 날짜를 체크해 한 번에 처리할 수도 있습니다.
        </p>

        {message && (
          <div className="mt-3">
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          </div>
        )}

        {selected.size > 0 && (
          <div className="border-brand-200 bg-brand-50 mt-3 flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="text-ink text-sm font-bold">{selected.size}건 선택됨</span>
            <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={clearSelection}>
              선택 해제
            </button>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="btn btn-secondary min-h-8 px-3 text-xs"
                onClick={openBulkEdit}
              >
                일괄 수정
              </button>
              <button
                type="button"
                className="btn btn-danger-outline min-h-8 px-3 text-xs"
                onClick={openBulkDelete}
              >
                일괄 삭제
              </button>
            </div>
          </div>
        )}

        <div className="table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    className="accent-brand-700 size-4"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="전체 선택"
                  />
                </th>
                <th>예약번호</th>
                <th>방문 일정</th>
                <th>주차 위치</th>
                <th>상태</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => {
                const skippable = SKIPPABLE_STATUSES.has(occurrence.reservationStatus);
                const detailHref = `/admin/reservations/${occurrence.reservationId}?returnTo=${encodeURIComponent(returnTo)}`;

                return (
                  <ClickableTableRow key={occurrence.reservationId} href={detailHref}>
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="accent-brand-700 size-4"
                        checked={selected.has(occurrence.reservationId)}
                        onChange={() => toggleOne(occurrence.reservationId)}
                        aria-label={`${occurrence.reservationNo} 선택`}
                      />
                    </td>
                    <td className="font-mono text-xs">
                      <Link href={detailHref} className="text-brand-700 hover:underline">
                        {occurrence.reservationNo}
                      </Link>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstRange(
                        new Date(occurrence.visitStartAt),
                        new Date(occurrence.visitEndAt),
                      )}
                    </td>
                    <td className="font-mono text-xs">{occurrence.assignedSpaceCode ?? '-'}</td>
                    <td>
                      <StatusBadge status={occurrence.displayStatus} />
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <Link
                          href={detailHref}
                          className="btn btn-secondary min-h-8 w-8 px-0"
                          title="수정"
                          aria-label={`${occurrence.reservationNo} 예약 상세로 이동해 수정`}
                        >
                          <PencilIcon />
                        </Link>
                        {skippable && (
                          <button
                            type="button"
                            className="btn btn-danger-outline min-h-8 w-8 px-0"
                            title="제외 처리"
                            aria-label={`${occurrence.reservationNo} 날짜 제외 처리`}
                            onClick={() => openSkipPanel(occurrence)}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {skippingOccurrence && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-occurrence-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="닫기"
            onClick={closeSkipPanel}
          />

          <div className="card relative w-full max-w-md">
            <div className="card-body space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 id="skip-occurrence-title" className="card-title">
                  날짜 제외 처리
                </h3>
                <button type="button" className="btn btn-ghost" onClick={closeSkipPanel}>
                  닫기
                </button>
              </div>

              <p className="text-ink-muted text-sm">
                {formatKstRange(
                  new Date(skippingOccurrence.visitStartAt),
                  new Date(skippingOccurrence.visitEndAt),
                )}
                의 예약을 제외 처리합니다. 나머지 반복 일정은 그대로 유지됩니다.
              </p>

              {skipError && <Alert variant="error">{skipError}</Alert>}

              <FormField label="제외 사유" htmlFor="skip-reason" required>
                <textarea
                  id="skip-reason"
                  rows={3}
                  className={inputClassName(Boolean(skipError))}
                  placeholder="예: 연차로 자리를 쓰지 않음"
                  value={skipReason}
                  onChange={(event) => setSkipReason(event.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </FormField>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary flex-1"
                  disabled={skipSubmitting}
                  onClick={submitSkip}
                >
                  {skipSubmitting ? '처리 중…' : '제외 처리'}
                </button>
                <button type="button" className="btn btn-secondary flex-1" onClick={closeSkipPanel}>
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="닫기"
            onClick={closeBulkDelete}
          />

          <div className="card relative w-full max-w-lg">
            <div className="card-body max-h-[80vh] space-y-4 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <h3 id="bulk-delete-title" className="card-title">
                  선택한 {selectedOccurrences.length}건 일괄 제외 처리
                </h3>
                <button type="button" className="btn btn-ghost" onClick={closeBulkDelete}>
                  닫기
                </button>
              </div>

              {!bulkDeleteResult && (
                <>
                  <p className="text-ink-muted text-sm">
                    선택한 날짜 모두 같은 사유로 제외 처리합니다. 나머지 반복 일정은 그대로
                    유지됩니다.
                  </p>

                  {bulkDeleteError && <Alert variant="error">{bulkDeleteError}</Alert>}

                  <FormField label="제외 사유" htmlFor="bulk-skip-reason" required>
                    <textarea
                      id="bulk-skip-reason"
                      rows={3}
                      className={inputClassName(Boolean(bulkDeleteError))}
                      placeholder="예: 연차로 자리를 쓰지 않음"
                      value={bulkDeleteReason}
                      onChange={(event) => setBulkDeleteReason(event.target.value)}
                      maxLength={200}
                      autoFocus
                    />
                  </FormField>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      disabled={bulkDeleteSubmitting}
                      onClick={submitBulkDelete}
                    >
                      {bulkDeleteSubmitting ? '처리 중…' : '일괄 제외 처리'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary flex-1"
                      onClick={closeBulkDelete}
                    >
                      취소
                    </button>
                  </div>
                </>
              )}

              {bulkDeleteResult && <BulkResultList rows={bulkDeleteResult} />}
            </div>
          </div>
        </div>
      )}

      {bulkEditOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-edit-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="닫기"
            onClick={closeBulkEdit}
          />

          <div className="card relative w-full max-w-lg">
            <div className="card-body max-h-[80vh] space-y-4 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <h3 id="bulk-edit-title" className="card-title">
                  선택한 {selectedOccurrences.length}건 일괄 수정
                </h3>
                <button type="button" className="btn btn-ghost" onClick={closeBulkEdit}>
                  닫기
                </button>
              </div>

              {!bulkEditResult && (
                <>
                  <p className="text-ink-muted text-sm">
                    각 날짜는 그대로 두고, 매일 방문 시간대나 배정 주차면만 바꿉니다. 비워 둔
                    항목은 바꾸지 않습니다.
                  </p>

                  {bulkEditError && <Alert variant="error">{bulkEditError}</Alert>}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="새 시작 시간" htmlFor="bulk-edit-start">
                      <input
                        id="bulk-edit-start"
                        type="time"
                        className={inputClassName(false)}
                        value={bulkEditStartTime}
                        onChange={(event) => setBulkEditStartTime(event.target.value)}
                      />
                    </FormField>
                    <FormField label="새 종료 시간" htmlFor="bulk-edit-end">
                      <input
                        id="bulk-edit-end"
                        type="time"
                        className={inputClassName(false)}
                        value={bulkEditEndTime}
                        onChange={(event) => setBulkEditEndTime(event.target.value)}
                      />
                    </FormField>
                  </div>

                  <FormField label="새 주차면" htmlFor="bulk-edit-space">
                    <select
                      id="bulk-edit-space"
                      className={inputClassName(false)}
                      value={bulkEditSpaceId}
                      onChange={(event) => setBulkEditSpaceId(event.target.value)}
                    >
                      <option value="">변경 안 함</option>
                      {spaceOptions.map((space) => (
                        <option key={space.spaceId} value={space.spaceId}>
                          {space.areaName} - {space.spaceCode}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <p className="field-hint">
                    주차면 변경은 이미 승인되어 배정이 끝난 날짜(승인 완료·입차 중)에만
                    적용됩니다.
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      disabled={bulkEditSubmitting}
                      onClick={submitBulkEdit}
                    >
                      {bulkEditSubmitting ? '처리 중…' : '일괄 수정'}
                    </button>
                    <button type="button" className="btn btn-secondary flex-1" onClick={closeBulkEdit}>
                      취소
                    </button>
                  </div>
                </>
              )}

              {bulkEditResult && <BulkResultList rows={bulkEditResult} />}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** 일괄 작업(삭제/수정) 결과를 날짜별로 보여준다. */
function BulkResultList({ rows }: { rows: BulkResultRow[] }) {
  const successCount = rows.filter((row) => row.ok).length;
  return (
    <div className="space-y-3">
      <Alert variant={successCount === rows.length ? 'success' : 'error'}>
        {rows.length}건 중 {successCount}건 성공, {rows.length - successCount}건 실패했습니다.
      </Alert>
      <ul className="divide-line-muted divide-y text-sm">
        {rows.map((row) => (
          <li key={row.reservationNo} className="flex flex-col gap-0.5 py-2">
            <span className="text-ink font-mono text-xs font-bold">
              {row.reservationNo} · {row.dateLabel}
            </span>
            <span className={row.ok ? 'text-emerald-700' : 'text-red-600'}>{row.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 수정 픽토그램(연필). occurrence 행별 "예약 상세로 이동" 버튼에 쓴다. */
function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path
        d="M13.5 3.5a1.5 1.5 0 0 1 2.12 0l.88.88a1.5 1.5 0 0 1 0 2.12L7 16H4v-3L13.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 삭제 픽토그램(휴지통). occurrence 행별 "제외 처리" 버튼에 쓴다. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <path d="M4 6h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 3h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M6 6l.8 10.2A1 1 0 0 0 7.8 17h4.4a1 1 0 0 0 1-.8L14 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8.3 9v5M11.7 9v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
