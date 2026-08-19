'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

type Props = {
  adminName: string;
  roleCode: 'PARKING_ADMIN' | 'SYSTEM_ADMIN';
};

const BASE_MENU = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/reservations', label: '예약 목록' },
  { href: '/admin/email-logs', label: '이메일 이력' },
];

const SYSTEM_MENU = [
  { href: '/admin/settings', label: '시스템 설정' },
  { href: '/admin/audit-logs', label: '감사 로그' },
];

export function AdminNav({ adminName, roleCode }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const menu = roleCode === 'SYSTEM_ADMIN' ? [...BASE_MENU, ...SYSTEM_MENU] : BASE_MENU;

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
            {roleCode === 'SYSTEM_ADMIN' ? '시스템 관리자' : '주차 관리자'}: {adminName}
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
