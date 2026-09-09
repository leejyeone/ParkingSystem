'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

export function UserLogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await apiRequest('/api/auth/logout', { method: 'POST' });
    router.replace('/');
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
