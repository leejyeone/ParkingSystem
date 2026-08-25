'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatKstTime } from '@/lib/datetime';

type Props = {
  /** 시스템 설정에서 관리자가 정한 자동 새로고침 주기(분) */
  intervalMinutes: number;
};

/**
 * 대시보드를 상시 띄워 놓고 볼 것을 가정해, 주기적으로 `router.refresh()` 를 호출해
 * 새 신청·출차 알림을 놓치지 않게 한다. 현재 URL(`?date=...`)은 그대로 둔 채 서버
 * 컴포넌트만 다시 실행되므로 페이지 전체를 클라이언트 컴포넌트로 바꿀 필요가 없다.
 *
 * 탭이 백그라운드에 있는 동안은 갱신을 멈추고(불필요한 요청 방지), 다시 포그라운드로
 * 돌아오면 즉시 한 번 갱신한다 — 자리를 비웠다 돌아왔을 때 오래된 화면을 보지 않게 한다.
 */
export function DashboardAutoRefresher({ intervalMinutes }: Props) {
  const router = useRouter();
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());

  useEffect(() => {
    function refresh() {
      router.refresh();
      setLastRefreshedAt(new Date());
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startInterval() {
      if (intervalId !== null) return;
      intervalId = setInterval(refresh, intervalMinutes * 60_000);
    }

    function stopInterval() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        stopInterval();
        return;
      }
      refresh();
      startInterval();
    }

    if (document.visibilityState === 'visible') startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // 관리자가 시스템 설정에서 주기를 바꾸면(→ router.refresh() → 이 컴포넌트도 새 props 로
    // 다시 렌더) 새로고침 없이 바로 새 주기로 재구독되도록 intervalMinutes 를 의존성에 둔다.
  }, [intervalMinutes, router]);

  return <span aria-live="polite">{formatKstTime(lastRefreshedAt)}</span>;
}
