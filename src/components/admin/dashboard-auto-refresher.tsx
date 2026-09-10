'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatKstTime } from '@/lib/datetime';

type Props = {
  /** 시스템 설정에서 관리자가 정한 자동 새로고침 주기(분) */
  intervalMinutes: number;
};

/**
 * intervalMinutes 가 나눠떨어지는 다음 "벽시계 정각"까지 남은 ms.
 *
 * epoch(1970-01-01 00:00:00 UTC)가 분 단위 경계이고 KST 는 UTC+9(분 단위로 정확히
 * 나눠떨어지는 오프셋)라서, epoch 로부터의 밀리초를 그대로 나눠도 한국 시간 기준
 * 정각(예: 5분 주기면 :00, :05, :10…)과 맞아떨어진다.
 */
function msUntilNextWallClockBoundary(intervalMinutes: number): number {
  const intervalMs = intervalMinutes * 60_000;
  return intervalMs - (Date.now() % intervalMs);
}

/**
 * 대시보드를 상시 띄워 놓고 볼 것을 가정해, 주기적으로 `router.refresh()` 를 호출해
 * 새 신청·출차 알림을 놓치지 않게 한다. 현재 URL(`?date=...`)은 그대로 둔 채 서버
 * 컴포넌트만 다시 실행되므로 페이지 전체를 클라이언트 컴포넌트로 바꿀 필요가 없다.
 *
 * 새로고침 시각은 페이지를 연 시점이 아니라 벽시계 정각(예: 5분 주기면 매 시 :00, :05,
 * :10…)에 맞춘다 — 화면에 함께 떠 있는 실시간 시계와 새로고침 타이밍이 어긋나 보이지
 * 않게 하기 위함이다.
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

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function clearScheduled() {
      if (timeoutId === null) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // setInterval 하나로는 매번 "정각까지 남은 시간"이 달라지므로, 매번 다음 정각까지의
    // 시간을 다시 계산해 setTimeout 을 이어 거는 방식으로 정렬을 유지한다.
    function scheduleNext() {
      clearScheduled();
      timeoutId = setTimeout(() => {
        refresh();
        scheduleNext();
      }, msUntilNextWallClockBoundary(intervalMinutes));
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearScheduled();
        return;
      }
      refresh();
      scheduleNext();
    }

    if (document.visibilityState === 'visible') scheduleNext();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearScheduled();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // 관리자가 시스템 설정에서 주기를 바꾸면(→ router.refresh() → 이 컴포넌트도 새 props 로
    // 다시 렌더) 새로고침 없이 바로 새 주기로 재구독되도록 intervalMinutes 를 의존성에 둔다.
  }, [intervalMinutes, router]);

  return <span aria-live="polite">{formatKstTime(lastRefreshedAt)}</span>;
}
