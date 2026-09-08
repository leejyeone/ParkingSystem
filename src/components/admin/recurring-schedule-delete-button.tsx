'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

/** 반복 예약 시리즈 삭제 버튼. 반복 일정 수정 버튼 옆(상세 화면 헤더)에 둔다. */
export function RecurringScheduleDeleteButton({ scheduleId }: { scheduleId: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !window.confirm(
        '반복 예약을 삭제할까요? 아직 입차하지 않은 남은 예정 방문은 모두 취소되고, 이 반복 ' +
          '일정 자체가 삭제됩니다. 이미 입차 중인 occurrence는 실제로 자리를 쓰고 있어 자동으로 ' +
          '취소되지 않으니, 출차 처리 후 다시 확인해 주세요.',
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    const response = await apiRequest<{ cancelledCount: number; stillParkedCount: number }>(
      `/api/admin/recurring-reservations/${scheduleId}`,
      { method: 'DELETE' },
    );
    setDeleting(false);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    if (response.data.stillParkedCount > 0) {
      window.alert(
        `이미 입차 중인 예약 ${response.data.stillParkedCount}건은 취소되지 않았습니다. ` +
          '해당 예약은 출차 처리 후에도 이 화면 목록에는 남아 있으니, 예약 상세에서 직접 ' +
          '확인·취소해 주세요.',
      );
    }

    // force-dynamic 페이지라 push만으로 최신 목록을 다시 가져온다 — refresh는 중복 요청이다.
    router.push('/admin/recurring-reservations');
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-danger-outline min-h-9 px-3 text-xs"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? '삭제 중…' : '반복 예약 삭제'}
      </button>
      {error && <p className="field-error text-xs">{error}</p>}
    </div>
  );
}
