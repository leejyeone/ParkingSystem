import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EmployeeLoginForm } from '@/components/employee/employee-login-form';
import { getEmployeeSession } from '@/lib/employee-session';
import { safeEmployeeRedirect } from '@/lib/employee-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string }> };

export default async function EmployeeLoginPage({ searchParams }: PageProps) {
  const session = await getEmployeeSession();
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = safeEmployeeRedirect(redirectParam);

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mt-2 text-2xl font-black text-slate-900">직원 로그인</h1>
        <p className="mt-1 text-sm text-slate-600">방문 신청을 하려면 로그인해 주세요.</p>
      </div>

      <EmployeeLoginForm redirectTo={redirectTo} />

      {/* <p className="mt-4 text-center text-sm text-slate-600">
        아직 계정이 없으신가요?{' '}
        <Link href="/employee/signup" className="text-brand-700 font-bold">
          직원 회원가입
        </Link>
      </p> */}
    </main>
  );
}
