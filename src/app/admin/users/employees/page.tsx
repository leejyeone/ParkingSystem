import type { Metadata } from 'next';

import { EmployeeUserPanel } from '@/components/admin/employee-user-panel';
import { listEmployeeUsers } from '@/services/employee-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '등록 직원 관리' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminUsersEmployeesPage() {
  const employeeUsers = await listEmployeeUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">등록 직원 관리</h1>
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
    </div>
  );
}
