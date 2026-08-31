'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiRequest } from '@/lib/client/api-client';
import { formatKstRange } from '@/lib/datetime';
import type { DisplayReservationStatus } from '@/domain/reservation-status';

type Occurrence = {
  reservationId: number;
  reservationNo: string;
  visitStartAt: string;
  visitEndAt: string;
  displayStatus: DisplayReservationStatus;
  reservationStatus: string;
};

/** 관리자가 개별 날짜를 제외 처리할 수 있는 상태 — 아직 방문 전이고 살아있는 건만 대상이다. */
const SKIPPABLE_STATUSES = new Set(['REQUESTED', 'APPROVED']);

export function RecurringScheduleOccurrenceTable({ occurrences }: { occurrences: Occurrence[] }) {
  const router = useRouter();
  const [skippingOccurrence, setSkippingOccurrence] = useState<Occurrence | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipSubmitting, setSkipSubmitting] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );

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

  return (
    <section className="card">
      <div className="card-body">
        <h2 className="card-title">개별 예약</h2>
        <p className="field-hint">
          직원이 연차 등으로 특정 날짜에 자리를 쓰지 않는다면, 그 날짜만 &quot;제외 처리&quot;하면
          됩니다 — 나머지 일정은 그대로 유지됩니다.
        </p>

        {message && (
          <div className="mt-3">
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          </div>
        )}

        <div className="table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th>예약번호</th>
                <th>방문 일정</th>
                <th>상태</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => {
                const skippable = SKIPPABLE_STATUSES.has(occurrence.reservationStatus);

                return (
                  <tr key={occurrence.reservationId}>
                    <td className="font-mono text-xs">
                      <Link
                        href={`/admin/reservations/${occurrence.reservationId}`}
                        className="text-brand-700 hover:underline"
                      >
                        {occurrence.reservationNo}
                      </Link>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstRange(
                        new Date(occurrence.visitStartAt),
                        new Date(occurrence.visitEndAt),
                      )}
                    </td>
                    <td>
                      <StatusBadge status={occurrence.displayStatus} />
                    </td>
                    <td>
                      {skippable && (
                        <button
                          type="button"
                          className="btn btn-secondary min-h-8 px-2 text-xs"
                          onClick={() => openSkipPanel(occurrence)}
                        >
                          제외 처리
                        </button>
                      )}
                    </td>
                  </tr>
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
    </section>
  );
}
