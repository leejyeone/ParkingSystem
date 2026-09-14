'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { UserLogoutButton } from '@/components/user/user-logout-button';

export type TopBarSession =
  | { kind: 'employee'; name: string }
  | { kind: 'member'; name: string }
  | { kind: 'anonymous' };

const PILL_LINK_CLASS =
  'flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2 text-xs font-bold whitespace-nowrap text-white transition hover:bg-white/10';

/**
 * 관리자 화면을 제외한 모든 화면(직원 + 방문객/회원)에 뜨는 고정 상단바.
 *
 * 어느 폴더 아래에 있는지가 아니라 "지금 어떤 세션이 실제로 있는가"로 좌측 홈 링크와
 * 우측 버튼을 결정한다 — 직원이 `/employee/reservations`에서 자기 신청을 눌러
 * `/r/[token]`(방문객 라우트)으로 넘어가도 여전히 "직원 홈"으로 돌아갈 수 있어야 하기
 * 때문이다. 로그인 화면(`/employee/login`)은 세션이 없어 "내 정보"/"로그아웃"이 의미가
 * 없으므로, 라우트 그룹으로 나누지 않고 이 컴포넌트가 경로를 보고 스스로 숨는다.
 */
export function SiteTopBar({ session }: { session: TopBarSession }) {
  const pathname = usePathname();
  if (pathname.startsWith('/admin') || pathname === '/employee/login') return null;

  const homeHref = session.kind === 'employee' ? '/employee' : '/';

  return (
    <header className="bg-brand-900 sticky top-0 z-30">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={homeHref} className="flex items-center gap-2 text-white">
          <span className="flex shrink-0 items-center rounded bg-white px-2 py-1">
            <Image
              src="/synopex-logo.png"
              alt="Synopex"
              width={85}
              height={24}
              className="h-6 w-[85px]"
              priority
            />
          </span>
          <span className="text-base font-black whitespace-nowrap sm:text-lg">시노펙스 방문 예약</span>
        </Link>
        <div className="flex items-center gap-2">
          {session.kind === 'employee' && (
            <>
              <Link href="/employee/profile" className={PILL_LINK_CLASS}>
                <PersonIcon />
                {session.name}
              </Link>
              <EmployeeLogoutButton variant="onDark" />
            </>
          )}
          {session.kind === 'member' && (
            <>
              <Link href="/mypage" className={PILL_LINK_CLASS}>
                <PersonIcon />
                {session.name}
              </Link>
              <UserLogoutButton variant="onDark" />
            </>
          )}
          {session.kind === 'anonymous' && (
            <>
              <Link href="/login" className={PILL_LINK_CLASS}>
                로그인
              </Link>
              <Link href="/signup" className={PILL_LINK_CLASS}>
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
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
