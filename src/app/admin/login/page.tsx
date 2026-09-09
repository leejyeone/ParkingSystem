import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { resolveHomeHref } from '@/lib/home-link';
import { requireActiveAdmin } from '@/services/admin-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '관리자 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string }> };

export default async function AdminLoginPage({ searchParams }: PageProps) {
  // 쿠키 서명만 유효하고 계정이 비활성/삭제된 경우까지 "로그인됨"으로 보면, 이 화면과
  // 보호 화면(requireAdminPage) 사이에서 서로 되돌려보내는 리다이렉트 루프가 생긴다.
  // 계정 상태까지 확인하는 requireActiveAdmin()으로 판단해야 한다.
  const [session, homeHref] = await Promise.all([
    requireActiveAdmin().catch(() => null),
    resolveHomeHref(),
  ]);
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
      <div className="mb-6">
        <Link href={homeHref} className="text-brand-700 text-xs font-semibold">
          ← 예약 화면으로
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">관리자 로그인</h1>
        <p className="text-ink-muted mt-1 text-sm">방문 관리 담당자 전용 화면입니다.</p>
      </div>

      <AdminLoginForm redirectTo={redirectTo} />
    </main>
  );
}
