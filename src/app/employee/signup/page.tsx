import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmployeeSignUpForm } from '@/components/employee/employee-signup-form';
import { getEmployeeSession } from '@/lib/employee-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 회원가입' };

export default async function EmployeeSignUpPage() {
  const session = await getEmployeeSession();
  if (session) {
    redirect('/employee');
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mt-2 text-2xl font-black text-slate-900">직원 회원가입</h1>
        <p className="mt-1 text-sm text-slate-600">
          본인 방문 신청과 방문객 대리 신청을 하려면 직원 계정이 필요합니다.
        </p>
      </div>

      <EmployeeSignUpForm />

      <p className="mt-4 text-center text-sm text-slate-600">
        이미 계정이 있으신가요?{' '}
        <Link href="/employee/login" className="text-brand-700 font-bold">
          로그인
        </Link>
      </p>
    </main>
  );
}
