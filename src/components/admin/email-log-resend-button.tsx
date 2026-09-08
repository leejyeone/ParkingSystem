'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

type ResendResult = { emailLogId: number; sendStatus: 'PENDING' | 'SUCCESS' | 'FAILED' };

/** 발송 실패한 이메일 로그 1건을 원문 그대로 재발송하는 버튼. */
export function EmailLogResendButton({ emailLogId }: { emailLogId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setPending(true);
    setError(null);

    const response = await apiRequest<ResendResult>(`/api/admin/email-logs/${emailLogId}/resend`, {
      method: 'POST',
    });

    if (response.ok && response.data.sendStatus === 'SUCCESS') {
      // 필터가 걸려 있으면(예: 실패 건만 보기) 방금 성공한 건이 목록에서 바로 사라져
      // 결과를 확인할 수 없다. 성공했을 때만 전체 이력으로 보내 새 행을 볼 수 있게 한다.
      // force-dynamic 페이지라 push만으로 최신 목록을 다시 가져온다 — refresh는 중복 요청이다.
      router.push('/admin/email-logs');
      return;
    }

    // 재발송을 시도했지만 또 실패한 경우: 이 필터 화면에 남아 새로 생긴 실패 행을 바로 볼 수 있다.
    if (response.ok) {
      router.refresh();
      return;
    }

    setPending(false);
    setError(response.error.message);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="border-line text-ink-muted hover:bg-surface-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        onClick={handleResend}
      >
        {pending ? '재발송 중…' : '재발송'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
