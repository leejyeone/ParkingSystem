'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

const VARIANT_CLASS = {
  /** 밝은 배경 화면(마이페이지 등)에서 쓰는 기본 스타일 */
  default: 'bg-red-50 text-red-600 hover:bg-red-100',
  /** 네이비 상단바 등 어두운 배경 위에서 쓰는 스타일 */
  onDark: 'border border-white/30 text-white hover:bg-white/10',
} as const;

export function UserLogoutButton({
  variant = 'default',
}: { variant?: keyof typeof VARIANT_CLASS } = {}) {
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
      className={`rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap transition disabled:opacity-60 ${VARIANT_CLASS[variant]}`}
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}
