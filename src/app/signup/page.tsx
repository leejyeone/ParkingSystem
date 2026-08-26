import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserSignUpForm } from '@/components/user/user-signup-form';
import { resolveHomeHref } from '@/lib/home-link';
import { getUserSession } from '@/lib/user-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '회원가입' };

export default async function SignUpPage() {
  const [session, homeHref] = await Promise.all([getUserSession(), resolveHomeHref()]);
  if (session) {
    redirect('/mypage');
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <Link href={homeHref} className="text-brand-700 text-xs font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900">회원가입</h1>
        <p className="mt-1 text-sm text-slate-600">
          자주 방문하신다면 정보를 저장해 두고 매번 자동으로 불러오세요.
        </p>
      </div>

      <UserSignUpForm />

      <p className="mt-4 text-center text-sm text-slate-600">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-brand-700 font-bold">
          로그인
        </Link>
      </p>
    </main>
  );
}
