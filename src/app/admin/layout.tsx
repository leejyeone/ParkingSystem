import type { Metadata } from 'next';

import { AdminNav } from '@/components/admin/admin-nav';
import { getAdminSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: { default: '관리자', template: '%s | 관리자' } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  return (
    <div className="min-h-screen bg-slate-100">
      {session && <AdminNav adminName={session.adminName} />}
      {children}
    </div>
  );
}
