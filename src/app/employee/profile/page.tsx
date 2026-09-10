import type { Metadata } from 'next';
import Link from 'next/link';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { EmployeeProfilePanel } from '@/components/employee/employee-profile-panel';
import { Alert } from '@/components/ui/alert';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

type PageProps = { searchParams: Promise<{ reason?: string }> };

/** 직원 마이페이지 — 본인 정보(사업장명·차량번호·전화번호) 수정. */
export default async function EmployeeProfilePage({ searchParams }: PageProps) {
  const session = await requireEmployeePage('/employee/profile');
  const profile = await getEmployeeProfile(session.employeeUserId);
  const { reason } = await searchParams;

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

      {reason === 'phone_required' && (
        <Alert variant="warning" title="전화번호 등록이 필요합니다">
          방문객이 담당자를 등록할 때 이름과 함께 확인하는 값이라, 전화번호를 입력해야 다른
          화면을 이용할 수 있습니다.
        </Alert>
      )}

      {profile && <EmployeeProfilePanel profile={profile} />}
    </main>
  );
}
