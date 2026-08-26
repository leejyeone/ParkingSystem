import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { resolveHomeHref } from '@/lib/home-link';
import { getAdminSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '관리자 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string }> };

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const [session, homeHref] = await Promise.all([getAdminSession(), resolveHomeHref()]);
  const { redirect: redirectParam } = await searchParams;

  // 열린 리다이렉트를 막기 위해 내부 경로만 허용한다.
  const redirectTo =
    redirectParam && redirectParam.startsWith('/admin') && !redirectParam.startsWith('//')
      ? redirectParam
      : '/admin';

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <Link href={homeHref} className="text-brand-700 text-xs font-semibold">
          ← 예약 화면으로
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">관리자 로그인</h1>
        <p className="mt-1 text-sm text-slate-600">방문 관리 담당자 전용 화면입니다.</p>
      </div>

      <AdminLoginForm redirectTo={redirectTo} />
    </main>
  );
}
