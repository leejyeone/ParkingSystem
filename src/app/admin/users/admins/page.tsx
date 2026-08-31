import type { Metadata } from 'next';

import { AdminUserSection } from '@/components/admin/settings-panel';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { listAdminUsers } from '@/services/admin-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '관리자 계정' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다. 이 화면은 그중에서도
// 시스템 관리자만 볼 수 있다 — 그대로 두면 주차 관리자도 새 관리자 계정을 만들 수
// 있게 되어 버린다.
export default async function AdminUsersAdminsPage() {
  await requireSystemAdminPage('/admin/users/admins');
  const adminUsers = await listAdminUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">관리자 계정</h1>
        <p className="text-ink-muted mt-1 text-sm">
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
