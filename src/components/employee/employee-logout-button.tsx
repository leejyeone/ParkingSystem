'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

/** confirmMessage 를 주면 그 문구로 window.confirm 을 먼저 통과해야 로그아웃된다. */
export function EmployeeLogoutButton({ confirmMessage }: { confirmMessage?: string } = {}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setLoggingOut(true);
    await apiRequest('/api/employee/auth/logout', { method: 'POST' });
    router.replace('/employee/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold whitespace-nowrap text-red-600 transition hover:bg-red-100 disabled:opacity-60"
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}
