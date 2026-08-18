/**
 * 세션 쿠키 이름만 담은 모듈.
 *
 * proxy(구 middleware)는 Node 전용 API 를 끌어오지 않아야 하므로,
 * next/headers 를 사용하는 session.ts 대신 이 모듈에서 상수를 가져간다.
 */
export const ADMIN_SESSION_COOKIE = 'parking_admin_session';

/** 일반 사용자(회원) 세션 쿠키 */
export const USER_SESSION_COOKIE = 'parking_user_session';
