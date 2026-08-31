'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'admin-dark-mode';

/**
 * 관리자 화면 전용 다크모드 on/off 상태.
 *
 * `localStorage` 에 저장해 새로고침해도 유지한다. 서버 렌더링 시점에는 저장된 값을 알 수
 * 없으므로 초기값은 항상 false(라이트) 로 시작하고, 마운트 후 저장된 값을 읽어 맞춘다 —
 * 이 컴포넌트가 관리자 로그인 화면 전체를 감싸는 `AdminShell` 안에서만 쓰이므로, 방문객
 * 화면에는 영향을 주지 않는다.
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // localStorage 는 서버에 없는 값이라 초기 state 를 여기서만 채울 수 있다 —
    // 서버 렌더링(라이트)과 클라이언트 첫 렌더를 일치시켜 하이드레이션 불일치를
    // 피하려는 의도적인 마운트 시 동기화이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return { isDark, toggle };
}

/**
 * 해/달 다크모드 토글 버튼. 화면 최상단 고정 헤더(`AdminShell` 의 `sticky top-0` 바)
 * 안에 놓는다 — 헤더 자체가 스크롤해도 항상 화면 위쪽에 고정돼 있으므로, 버튼도 함께
 * 항상 보인다. 계정 메뉴 등 기존 헤더 내용과 겹치지 않도록 별도 `fixed` 오버레이로
 * 띄우지 않고 헤더의 다른 버튼들과 같은 자리에 나란히 둔다.
 */
export function ThemeToggleButton({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="border-line bg-surface text-ink-muted hover:bg-surface-hover flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm transition"
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      aria-pressed={isDark}
      onClick={onToggle}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={4.5} stroke="currentColor" strokeWidth={2} />
      <path
        d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
