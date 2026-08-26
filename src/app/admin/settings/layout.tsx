import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '시스템 설정' };

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('/admin/settings');

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">시스템 설정</h1>
        <p className="mt-1 text-sm text-slate-600">
          시스템 관리자만 접근할 수 있습니다. 설정 변경 내역은 감사 로그에 기록됩니다.
        </p>
      </div>

      {children}
    </main>
  );
}
