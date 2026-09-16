import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserLoginForm } from '@/components/user/user-login-form';
import { resolveHomeHref } from '@/lib/home-link';
import { safeUserRedirect } from '@/lib/user-page-guard';
import { requireActiveUser } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string }> };

export default async function UserLoginPage({ searchParams }: PageProps) {
  // 쿠키 서명만 유효하고 계정이 비활성/삭제된 경우까지 "로그인됨"으로 보면, 이 화면과
  // 보호 화면(requireUserPage) 사이에서 서로 되돌려보내는 리다이렉트 루프가 생긴다.
  // 계정 상태까지 확인하는 requireActiveUser()로 판단해야 한다.
  const [session, homeHref] = await Promise.all([
    requireActiveUser().catch(() => null),
    resolveHomeHref(),
  ]);
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = redirectParam ? safeUserRedirect(redirectParam) : homeHref;

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">로그인</h1>
      </div>

      <UserLoginForm redirectTo={redirectTo} />

      <div className="mt-4 space-y-2 text-center text-sm">
        <p className="text-slate-600">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="text-brand-700 font-bold">
            회원가입
          </Link>
        </p>
        <p className="text-slate-500">비밀번호를 잊으셨다면 관리자에게 문의해 주세요.</p>
      </div>
    </main>
  );
}
