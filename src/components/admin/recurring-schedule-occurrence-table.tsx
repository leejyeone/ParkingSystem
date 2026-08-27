'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
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

export function RecurringScheduleOccurrenceTable({
  scheduleId,
  scheduleActive,
  occurrences,
}: {
  scheduleId: number;
  scheduleActive: boolean;
  occurrences: Occurrence[];
}) {
  const router = useRouter();
  const [skippingId, setSkippingId] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );

  async function submitSkip(reservationId: number) {
    if (!skipReason.trim()) {
      setMessage({ variant: 'error', text: '제외 사유를 입력해 주세요.' });
      return;
    }

    const response = await apiRequest(`/api/admin/reservations/${reservationId}/skip-recurring`, {
      method: 'POST',
      body: JSON.stringify({ reason: skipReason.trim() }),
    });

    if (!response.ok) {
      setMessage({ variant: 'error', text: response.error.message });
      return;
    }

    setSkippingId(null);
    setSkipReason('');
    setMessage({ variant: 'success', text: '해당 날짜를 제외 처리했습니다.' });
    router.refresh();
  }

  async function deleteWholeSchedule() {
    if (
      !window.confirm(
        '반복 예약을 삭제할까요? 남은 예정 방문이 모두 취소되고, 이 반복 일정 자체가 삭제됩니다.',
      )
    ) {
      return;
    }

    setDeleting(true);
    const response = await apiRequest<{ cancelledCount: number }>(
      `/api/admin/recurring-reservations/${scheduleId}`,
      { method: 'DELETE' },
    );
    setDeleting(false);

    if (!response.ok) {
      setMessage({ variant: 'error', text: response.error.message });
      return;
    }

    router.push('/admin/recurring-reservations');
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">개별 예약 ({occurrences.length}건)</h2>
          {scheduleActive && (
            <button
              type="button"
              className="btn btn-danger-outline min-h-9 px-3 text-xs"
              onClick={deleteWholeSchedule}
              disabled={deleting}
            >
              {deleting ? '삭제 중…' : '반복 예약 삭제'}
            </button>
          )}
        </div>
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
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => {
                const skippable = SKIPPABLE_STATUSES.has(occurrence.reservationStatus);
                const isEditing = skippingId === occurrence.reservationId;

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
                      {skippable &&
                        (isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="input min-h-8 px-2 py-1 text-xs"
                              placeholder="제외 사유"
                              value={skipReason}
                              onChange={(event) => setSkipReason(event.target.value)}
                              maxLength={200}
                            />
                            <button
                              type="button"
                              className="btn btn-primary min-h-8 px-2 text-xs"
                              onClick={() => submitSkip(occurrence.reservationId)}
                            >
                              확인
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary min-h-8 px-2 text-xs"
                              onClick={() => {
                                setSkippingId(null);
                                setSkipReason('');
                              }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary min-h-8 px-2 text-xs"
                            onClick={() => setSkippingId(occurrence.reservationId)}
                          >
                            제외 처리
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
