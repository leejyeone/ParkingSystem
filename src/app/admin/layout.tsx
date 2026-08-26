import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { getAdminSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: { default: '관리자', template: '%s | 관리자' } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  // 로그인 화면은 세션이 없는 상태로 이 레이아웃 아래에서 그려지므로, 사이드바 없이
  // 본문만 그대로 보여준다.
  if (!session) {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  return <AdminShell adminName={session.adminName}>{children}</AdminShell>;
}
