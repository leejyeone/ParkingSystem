'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { AdminPasswordPanel } from '@/components/admin/admin-password-panel';
import { apiRequest } from '@/lib/client/api-client';

type Props = {
  adminName: string;
  children: React.ReactNode;
};

type MenuItem = {
  href: string;
  label: string;
  /** 시스템 설정처럼 화면 안에 여러 섹션이 있으면 그 하위 라우트를 메뉴로 둔다. */
  children?: { href: string; label: string }[];
};

/**
 * 감사 로그는 잠시 비활성화 상태라 메뉴에서 뺐다. 페이지(/admin/audit-logs)와 데이터는
 * 그대로 남아있으니, 다시 노출하려면 이 메뉴 항목만 되살리면 된다.
 */
const MENU: MenuItem[] = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/reservations', label: '예약 목록' },
  { href: '/admin/employees', label: '직원 관리' },
  {
    href: '/admin/settings',
    label: '시스템 설정',
    children: [
      { href: '/admin/settings', label: '주차장 정보' },
      { href: '/admin/settings/areas-spaces', label: '구역·주차면' },
      { href: '/admin/settings/notifications', label: '관리자 이메일' },
      { href: '/admin/settings/admins', label: '관리자 계정' },
    ],
  },
  { href: '/admin/email-logs', label: '이메일 이력' },
];

/**
 * 관리자 화면 뼈대: 좌측 사이드바 + 본문.
 *
 * PC(lg 이상, 1024px)에서는 사이드바가 본문 옆에 나란히 펼쳐지지만, 헤더의 접기 버튼으로
 * 완전히 접을 수 있다 — 접으면 폭이 0 이 되어 본문이 그만큼 넓어지고, 화면 왼쪽 위에 작게
 * 남는 버튼으로 다시 펼친다. 그보다 좁은 화면(태블릿·모바일)에서는 사이드바가 기본적으로
 * 화면 밖에 숨어 있다가 좌상단 햄버거 버튼을 누르면 배경을 덮는 드로어로 나타난다.
 *
 * 두 상태 모두 이 컴포넌트가 직접 들고 있는다(URL 등에 반영하지 않음) — 새로고침마다
 * "PC 펼침 / 모바일 닫힘"으로 시작하는 편이 가장 무난한 기본값이다.
 */
export function AdminShell({ adminName, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  // 하위 메뉴가 있는 항목(현재는 "시스템 설정") 중 지금 펼쳐진 것의 href. 처음 진입할 때는
  // 지금 보고 있는 페이지가 속한 항목을 미리 펼쳐 둔다.
  const [expandedHref, setExpandedHref] = useState<string | null>(
    () => MENU.find((item) => item.children && pathname.startsWith(item.href))?.href ?? null,
  );

  // 메뉴를 눌러 페이지가 바뀌면 모바일 드로어는 자동으로 닫는다. effect 대신 렌더 중
  // 이전 경로와 비교해 처리한다(리액트가 권장하는 "prop 변화에 맞춰 state 조정" 패턴).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDrawerOpen(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await apiRequest('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      {/* PC 에서 사이드바를 접었을 때, 다시 펼치는 버튼. 접힌 사이드바는 폭이 0 이라 안의
          버튼을 누를 수 없으므로 화면에 따로 떠 있는 버튼을 둔다. */}
      {desktopCollapsed && (
        <button
          type="button"
          className="fixed top-4 left-4 z-40 hidden rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 lg:flex"
          aria-label="사이드바 펼치기"
          onClick={() => setDesktopCollapsed(false)}
        >
          <HamburgerIcon />
        </button>
      )}

      {/* 드로어가 열려 있을 때 뒤 배경을 어둡게 덮는다. 눌러도 닫힌다. (모바일 전용) */}
      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          aria-label="메뉴 닫기"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:sticky lg:inset-auto lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width] ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        } ${desktopCollapsed ? 'lg:w-0 lg:overflow-hidden lg:border-r-0' : 'lg:w-64'}`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-4">
          <Link href="/admin" className="text-lg font-black whitespace-nowrap text-slate-900">
            시스템 관리
          </Link>
          {/* 모바일: 드로어 닫기. PC: 사이드바 접기. 화면 폭에 따라 하나만 보인다. */}
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
          >
            <CloseIcon />
          </button>
          <button
            type="button"
            className="hidden rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 lg:block"
            aria-label="사이드바 접기"
            onClick={() => setDesktopCollapsed(true)}
          >
            <CollapseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {MENU.map((item) => {
            const active =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

            if (!item.children) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-bold whitespace-nowrap transition ${
                    active ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            }

            // 하위 메뉴가 있는 항목은 눌러도 이동하지 않고 목록만 펼치고/접는다.
            // 실제 이동은 아래 하위 항목을 눌러야 한다.
            const expanded = expandedHref === item.href;
            return (
              <div key={item.href}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-bold whitespace-nowrap transition ${
                    active ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-expanded={expanded}
                  onClick={() => setExpandedHref(expanded ? null : item.href)}
                >
                  {item.label}
                  <ChevronIcon className={expanded ? 'rotate-180' : ''} />
                </button>
                {expanded && (
                  <div className="mt-1 ml-3 space-y-0.5 border-l border-slate-200 pl-3">
                    {item.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                            childActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* 실제 페이지가 각자 <main> 을 그리므로 여기는 레이아웃 전용 div 로 둔다(중첩 <main> 방지). */}
      <div className="min-w-0 flex-1">
        {/*
          화면 최상단 고정 바. 관리자 이름·역할과 로그아웃을 여기 한 곳에 모아 둔다
          (예전에는 사이드바 맨 아래에 있었다). 모바일에서는 왼쪽에 햄버거 버튼도 같이 둔다.
        */}
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
              aria-label="메뉴 열기"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <HamburgerIcon />
            </button>
            <Link href="/admin" className="text-lg font-black text-slate-900">
              시스템 관리
            </Link>
          </div>

          {/* lg 이상에서는 왼쪽이 비므로, 오른쪽 그룹이 항상 오른쪽 끝에 붙도록 spacer 를 둔다. */}
          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-right transition hover:opacity-70"
              onClick={() => setShowPasswordPanel(true)}
            >
              <span className="block text-sm font-bold whitespace-nowrap text-slate-900">
                {adminName}
              </span>
              <span className="hidden text-xs whitespace-nowrap text-slate-500 sm:block">
                시스템 관리자
              </span>
            </button>
            <button
              type="button"
              className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold whitespace-nowrap text-red-600 transition hover:bg-red-100 disabled:opacity-60"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </div>

        {children}
      </div>

      {showPasswordPanel && <AdminPasswordPanel onClose={() => setShowPasswordPanel(false)} />}
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** 하위 메뉴 펼침/접힘 표시. 펼치면 위쪽을 향하도록 180도 회전시켜 쓴다. */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-150 ${className ?? ''}`}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

/** 사이드바 접기: 왼쪽을 향한 이중 꺾쇠(«)로 "접는다"는 방향을 직관적으로 보여준다. */
function CollapseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 5l-6 7 6 7M18 5l-6 7 6 7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
