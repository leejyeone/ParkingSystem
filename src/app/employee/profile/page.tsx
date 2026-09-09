import type { Metadata } from 'next';
import Link from 'next/link';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { EmployeeProfilePanel } from '@/components/employee/employee-profile-panel';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

/** 직원 마이페이지 — 본인 정보(사업장명·차량번호) 수정. */
export default async function EmployeeProfilePage() {
  const session = await requireEmployeePage('/employee/profile');
  const profile = await getEmployeeProfile(session.employeeUserId);

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/employee" className="text-brand-700 text-sm font-semibold">
            ← 직원 홈
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
          {profile && (
            <p className="mt-1 text-sm text-slate-600">
              {profile.departmentName} {profile.name}님, 안녕하세요.
            </p>
          )}
        </div>
        <EmployeeLogoutButton />
      </div>

      {profile && <EmployeeProfilePanel profile={profile} />}
    </main>
  );
}
