import { NextResponse, type NextRequest } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  EMPLOYEE_SESSION_COOKIE,
  USER_SESSION_COOKIE,
} from '@/lib/session-cookie';

/**
 * 보호 화면 접근 제어(1차 방어선).
 *
 * Next.js 16 부터 `middleware` 규약이 `proxy` 로 대체되었다.
 *
 * 여기서는 세션 쿠키의 "존재 여부"만 확인해 미인증 접근을 로그인 페이지로 보낸다.
 * 실제 서명 검증과 계정 상태 확인은 각 페이지/Route Handler 의
 * requireActiveAdmin() / requireActiveEmployee() / requireActiveUser() 에서 수행한다.
 * (proxy 만 믿지 않는다)
 *
 * 주의
 *  - 관리자·직원·회원 화면은 확인할 쿠키도, 보낼 로그인 페이지도 각각 다르다.
 *  - 비로그인 사용자도 쓸 수 있어야 하는 경로(/, /reservations/**, /r/[token], /api/**)는
 *    matcher 에 절대 넣지 않는다.
 *  - 이 파일은 Node 전용 API 를 import 하면 안 된다. 쿠키 이름은 상수 모듈에서만 가져온다.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  function redirectToLogin(loginPath: string) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin')) {
    if (request.cookies.get(ADMIN_SESSION_COOKIE)?.value) return NextResponse.next();
    return redirectToLogin('/admin/login');
  }

  if (pathname.startsWith('/employee')) {
    if (request.cookies.get(EMPLOYEE_SESSION_COOKIE)?.value) return NextResponse.next();
    return redirectToLogin('/employee/login');
  }

  // 그 외(현재는 /mypage 만): 회원(방문객) 세션
  if (request.cookies.get(USER_SESSION_COOKIE)?.value) return NextResponse.next();
  return redirectToLogin('/login');
}

export const config = {
  matcher: [
    '/admin',
    '/admin/((?!login).*)',
    '/employee',
    '/employee/((?!login|signup).*)',
    '/mypage',
    '/mypage/(.*)',
  ],
};
