import type { Metadata } from 'next';

import { AdminUserSection } from '@/components/admin/settings-panel';
import { listAdminUsers } from '@/services/admin-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '관리자 계정' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminUsersAdminsPage() {
  const adminUsers = await listAdminUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">관리자 계정</h1>
        <p className="mt-1 text-sm text-slate-600">
          관리자 계정을 추가·수정하고 활성/비활성 상태를 관리합니다. 변경 내역은 감사 로그에
          기록됩니다.
        </p>
      </div>

      <AdminUserSection
        adminUsers={adminUsers.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
