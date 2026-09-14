'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';

/**
 * 직원 화면 전용 고정 상단바.
 *
 * 로그인 화면(`/employee/login`)은 세션이 없어 "내 정보"/"로그아웃"이 의미가 없으므로,
 * 폴더 구조를 라우트 그룹으로 나누지 않고 이 컴포넌트가 경로를 보고 스스로 숨는다.
 */
export function EmployeeTopBar() {
  const pathname = usePathname();
  if (pathname === '/employee/login') return null;

  return (
    <header className="bg-brand-900 sticky top-0 z-30">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/employee" className="flex items-center gap-2 text-white">
          <CarIcon />
          <span className="text-base font-black whitespace-nowrap sm:text-lg">시노펙스 방문 예약</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/employee/profile"
            className="flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2 text-xs font-bold whitespace-nowrap text-white transition hover:bg-white/10"
          >
            <PersonIcon />
            내 정보
          </Link>
          <EmployeeLogoutButton variant="onDark" />
        </div>
      </div>
    </header>
  );
}

function CarIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 16.5V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M5 11h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={8} cy={16.5} r={0.5} fill="currentColor" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={8} r={3.5} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}
