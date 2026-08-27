import type { Metadata } from 'next';

import { EmployeeUserPanel } from '@/components/admin/employee-user-panel';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { listEmployeeUsers } from '@/services/employee-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 관리' };

export default async function AdminEmployeesPage() {
  await requireAdminPage('/admin/employees');

  const employeeUsers = await listEmployeeUsers();

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">직원 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          직원 계정은 명부 시드 스크립트로 관리됩니다. 퇴사자는 삭제 대신 비활성화해 주세요.
        </p>
      </div>

      <EmployeeUserPanel
        employeeUsers={employeeUsers.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
