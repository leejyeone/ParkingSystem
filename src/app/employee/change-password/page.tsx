import type { Metadata } from 'next';

import { EmployeeForcePasswordForm } from '@/components/employee/employee-force-password-form';
import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { EMPLOYEE_CHANGE_PASSWORD_PATH, requireEmployeePage } from '@/lib/employee-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '비밀번호 변경' };

/**
 * 첫 로그인 강제 비밀번호 변경 화면.
 * 관리자가 만든 계정(고정 초기 비밀번호)으로 로그인하면, 비밀번호를 바꾸기 전까지
 * requireEmployeePage() 가 다른 모든 직원 화면 대신 이 화면으로 보낸다.
 */
export default async function EmployeeChangePasswordPage() {
  await requireEmployeePage(EMPLOYEE_CHANGE_PASSWORD_PATH);

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-slate-900">비밀번호 변경</h1>
        <p className="mt-1 text-sm text-slate-600">
          관리자가 부여한 초기 비밀번호를 그대로 쓰고 계십니다. 계속 이용하려면 새 비밀번호로
          바꿔주세요.
        </p>
      </div>

      <EmployeeForcePasswordForm />

      <div className="mt-4 text-center">
        <EmployeeLogoutButton />
      </div>
    </main>
  );
}
