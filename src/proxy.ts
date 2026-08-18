import { NextResponse, type NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE, USER_SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * 보호 화면 접근 제어(1차 방어선).
 *
 * Next.js 16 부터 `middleware` 규약이 `proxy` 로 대체되었다.
 *
 * 여기서는 세션 쿠키의 "존재 여부"만 확인해 미인증 접근을 로그인 페이지로 보낸다.
 * 실제 서명 검증과 계정 상태 확인은 각 페이지/Route Handler 의
 * requireActiveAdmin() / requireActiveUser() 에서 수행한다. (proxy 만 믿지 않는다)
 *
 * 주의
 *  - 관리자 화면과 회원 화면은 확인할 쿠키도, 보낼 로그인 페이지도 다르다.
 *  - 비로그인 사용자도 쓸 수 있어야 하는 경로(/, /reservations/**, /r/[token], /api/**)는
 *    matcher 에 절대 넣지 않는다.
 *  - 이 파일은 Node 전용 API 를 import 하면 안 된다. 쿠키 이름은 상수 모듈에서만 가져온다.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminArea = pathname.startsWith('/admin');

  const sessionCookie = isAdminArea ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE;
  if (request.cookies.get(sessionCookie)?.value) {
    return NextResponse.next();
  }

  const loginUrl = new URL(isAdminArea ? '/admin/login' : '/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 관리자 화면(로그인 페이지 제외)과 회원 전용 마이페이지
  matcher: ['/admin', '/admin/((?!login).*)', '/mypage', '/mypage/(.*)'],
};
