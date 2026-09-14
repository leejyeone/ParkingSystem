'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useIsMaximized } from '@/components/admin/maximizable-card';

const STORAGE_KEY = 'admin-parking-map-pending-badge';

/**
 * 승인대기 뱃지 on/off 상태. `theme-toggle.tsx`의 `useDarkMode`와 같은 이유로
 * `localStorage`에 저장하고 마운트 후에만 저장된 값을 반영한다(하이드레이션 불일치 방지) —
 * 기본값은 "보임" 이므로 초기 false(꺼짐) 대신 true(켜짐)로 시작한다.
 */
function usePendingBadgeVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(stored === '1');
    }
  }, []);

  function toggle() {
    setVisible((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return { visible, toggle };
}

/**
 * 방문 예약 + 법인차량 승인대기를 합산한 빨간 뱃지 — 관리실 모니터(`/admin/parking-map`)
 * 화면에서 승인 대기가 쌓여도 알아차릴 수 있도록 `MaximizableCard`의 header 슬롯에 둔다.
 * 눈 아이콘으로 껐다 켤 수 있으며, 꺼진 상태에서도 다시 켤 수 있도록 토글 버튼은 계속 보인다.
 */
export function PendingApprovalBadge({ count }: { count: number }) {
  const { visible, toggle } = usePendingBadgeVisible();
  // 최대화(관리실 모니터 상시 화면)에서는 조작용 버튼을 두지 않는다 — 뱃지 자체는
  // 저장된 설정대로 계속 보이거나 숨겨지고, 켜고 끄는 조작은 최대화를 풀었을 때만 한다.
  const isMaximized = useIsMaximized();

  return (
    <span className="flex items-center gap-1.5">
      {visible && count > 0 && (
        <Link
          href="/admin"
          className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-700"
          aria-label={`승인대기 ${count}건 — 대시보드로 이동`}
          title={`승인대기 ${count}건`}
        >
          {count}
        </Link>
      )}
      {!isMaximized && (
        <button
          type="button"
          className="border-line bg-surface text-ink-muted hover:bg-surface-hover flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition"
          aria-label={visible ? '승인대기 뱃지 숨기기' : '승인대기 뱃지 보이기'}
          aria-pressed={visible}
          onClick={toggle}
        >
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      )}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx={12} cy={12} r={3} stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.4 4.4M6.6 6.6A17.3 17.3 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.1-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
