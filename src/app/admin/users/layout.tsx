import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '사용자 관리' };

export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('/admin/users');

  return <main className="app-container-wide space-y-4">{children}</main>;
}
