'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

type Props = {
  adminName: string;
  roleCode: 'PARKING_ADMIN' | 'SYSTEM_ADMIN';
};

/**
 * 시스템 설정·감사 로그는 SYSTEM_ADMIN 전용이다(페이지 쪽 requireSystemAdminPage 와 짝을 맞춤).
 * 이메일 이력은 방문 관리자도 승인/반려 처리 중 발송 여부를 확인해야 해서 두 역할 모두에게 연다.
 */
const MENU: { href: string; label: string; systemOnly?: boolean }[] = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/reservations', label: '예약 목록' },
  { href: '/admin/settings', label: '시스템 설정', systemOnly: true },
  { href: '/admin/email-logs', label: '이메일 이력' },
  { href: '/admin/audit-logs', label: '감사 로그', systemOnly: true },
];

export function AdminNav({ adminName, roleCode }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const menu = MENU.filter((item) => !item.systemOnly || roleCode === 'SYSTEM_ADMIN');

  async function handleLogout() {
    setLoggingOut(true);
    await apiRequest('/api/admin/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="app-container-wide flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-xl font-black text-slate-900">
            시스템 관리
          </Link>
          <span className="badge bg-slate-100 text-slate-600">
            {roleCode === 'SYSTEM_ADMIN' ? '시스템 관리자' : '방문 관리자'}: {adminName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </div>
      </div>

      <nav className="app-container-wide -mt-2 flex gap-1 overflow-x-auto pb-2">
        {menu.map((item) => {
          const active =
            item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                active ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
