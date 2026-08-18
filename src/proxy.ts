import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * 관리자 화면 접근 제어(1차 방어선).
 *
 * Next.js 16 부터 `middleware` 규약이 `proxy` 로 대체되었다.
 *
 * 여기서는 세션 쿠키의 "존재 여부"만 확인해 미인증 접근을 로그인 페이지로 보낸다.
 * 실제 서명 검증과 계정 상태 확인은 각 페이지/Route Handler 의
 * requireActiveAdmin() 에서 수행한다. (proxy 만 믿지 않는다)
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // /admin/login 을 제외한 모든 관리자 화면
  matcher: ['/admin', '/admin/((?!login).*)'],
};
