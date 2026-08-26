'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { AdminPasswordPanel } from '@/components/admin/admin-password-panel';
import { apiRequest } from '@/lib/client/api-client';

type Props = {
  adminName: string;
};

/**
 * 감사 로그는 잠시 비활성화 상태라 메뉴에서 뺐다. 페이지(/admin/audit-logs)와 데이터는
 * 그대로 남아있으니, 다시 노출하려면 이 메뉴 항목만 되살리면 된다.
 */
const MENU: { href: string; label: string }[] = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/reservations', label: '예약 목록' },
  { href: '/admin/employees', label: '직원 관리' },
  { href: '/admin/settings', label: '시스템 설정' },
  { href: '/admin/email-logs', label: '이메일 이력' },
];

export function AdminNav({ adminName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);

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
          <button
            type="button"
            className="badge bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            onClick={() => setShowPasswordPanel(true)}
          >
            관리자: {adminName}
          </button>
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
        {MENU.map((item) => {
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

      {showPasswordPanel && <AdminPasswordPanel onClose={() => setShowPasswordPanel(false)} />}
    </header>
  );
}
