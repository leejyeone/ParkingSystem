import { AdminUserSection } from '@/components/admin/settings-panel';
import { listAdminUsers } from '@/services/admin-user-service';

export const dynamic = 'force-dynamic';

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsAdminsPage() {
  const adminUsers = await listAdminUsers();

  return (
    <AdminUserSection
      adminUsers={adminUsers.map((user) => ({
        ...user,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      }))}
    />
  );
}
