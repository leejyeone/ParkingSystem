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
      className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}
