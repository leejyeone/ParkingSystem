import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '시스템 설정' };

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('/admin/settings');

  return <main className="app-container-wide space-y-4">{children}</main>;
}
