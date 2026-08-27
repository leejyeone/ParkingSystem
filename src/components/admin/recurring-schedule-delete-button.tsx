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
        '반복 예약을 삭제할까요? 남은 예정 방문이 모두 취소되고, 이 반복 일정 자체가 삭제됩니다.',
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    const response = await apiRequest<{ cancelledCount: number }>(
      `/api/admin/recurring-reservations/${scheduleId}`,
      { method: 'DELETE' },
    );
    setDeleting(false);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    router.push('/admin/recurring-reservations');
    router.refresh();
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
