import { redirect } from 'next/navigation';

import type { UserSession } from '@/lib/user-session';
import { requireActiveUser } from '@/services/user-auth-service';

/**
 * 회원 전용 화면(Server Component) 접근 가드.
 * 미인증이면 회원 로그인 페이지로 보낸다.
 */
export async function requireUserPage(redirectTo: string): Promise<UserSession> {
  try {
    return await requireActiveUser();
  } catch {
    redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
}

/**
 * 로그인 후 돌려보낼 경로를 검증한다.
 * 열린 리다이렉트를 막기 위해 내부 회원 경로만 허용한다.
 */
export function safeUserRedirect(redirectParam: string | undefined): string {
  if (!redirectParam) return '/mypage';
  if (!redirectParam.startsWith('/') || redirectParam.startsWith('//')) return '/mypage';
  const allowedPrefixes = ['/mypage', '/reservations/new'];
  return allowedPrefixes.some((prefix) => redirectParam.startsWith(prefix))
    ? redirectParam
    : '/mypage';
}
