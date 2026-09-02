'use client';

import Link from 'next/link';

import { Alert } from '@/components/ui/alert';

/**
 * 전역 에러 화면. 에러 경계(error boundary)라 클라이언트 컴포넌트여야 한다.
 * 서버 에러 상세(스택 트레이스 등)는 다른 화면과 마찬가지로 노출하지 않는다.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-container">
      <h1 className="mb-4 text-xl font-black text-slate-900 sm:text-2xl">
        일시적인 오류가 발생했습니다
      </h1>
      <div className="space-y-4">
        <Alert variant="error" title="잠시 후 다시 시도해 주세요">
          <p>문제가 계속되면 담당자에게 문의해 주세요.</p>
        </Alert>
        <button type="button" className="btn btn-primary w-full" onClick={() => reset()}>
          다시 시도
        </button>
        <Link href="/" className="btn btn-secondary w-full">
          처음으로
        </Link>
      </div>
    </main>
  );
}
