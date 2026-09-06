import type { Metadata } from 'next';

import { EmployeeUserPanel } from '@/components/admin/employee-user-panel';
import { UniportalSyncPanel } from '@/components/admin/uniportal-sync-panel';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { isUniportalConfigured } from '@/lib/uniportal-db';
import { listEmployeeUsers } from '@/services/employee-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '등록 직원 관리' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다. 이 화면은 그중에서도
// 시스템 관리자만 볼 수 있다.
export default async function AdminUsersEmployeesPage() {
  await requireSystemAdminPage('/admin/users/employees');
  const employeeUsers = await listEmployeeUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">등록 직원 관리</h1>
        <p className="text-ink-muted mt-1 text-sm">
          직원 계정은 [그룹웨어 명부 갱신]으로 일괄 반영하거나 [직원 추가]로 개별 등록합니다.
          퇴사자는 삭제 대신 비활성화해 주세요.
        </p>
      </div>

      <UniportalSyncPanel configured={isUniportalConfigured()} />

      <EmployeeUserPanel
        employeeUsers={employeeUsers.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
