import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserLoginForm } from '@/components/user/user-login-form';
import { resolveHomeHref } from '@/lib/home-link';
import { safeUserRedirect } from '@/lib/user-page-guard';
import { getUserSession } from '@/lib/user-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string }> };

export default async function UserLoginPage({ searchParams }: PageProps) {
  const [session, homeHref] = await Promise.all([getUserSession(), resolveHomeHref()]);
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = safeUserRedirect(redirectParam);

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <Link href={homeHref} className="text-brand-700 text-xs font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">로그인</h1>
        <p className="mt-1 text-sm text-slate-600">
          로그인하면 방문 신청 시 내 정보가 자동으로 입력됩니다.
        </p>
      </div>

      <UserLoginForm redirectTo={redirectTo} />

      <div className="mt-4 space-y-2 text-center text-sm">
        <p className="text-slate-600">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="text-brand-700 font-bold">
            회원가입
          </Link>
        </p>
        <p className="text-slate-500">
          로그인 없이도{' '}
          <Link href="/reservations/new" className="text-brand-700 font-semibold">
            방문 신청
          </Link>
          과{' '}
          <Link href="/reservations/lookup" className="text-brand-700 font-semibold">
            예약 조회
          </Link>
          를 이용할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
