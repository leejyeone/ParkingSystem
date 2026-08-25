import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { getSessionMaxAgeMinutes, getSessionSecret, isProduction } from '@/lib/env';
import { USER_SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * 일반 사용자(회원) 세션.
 *
 * - 로그인은 "선택" 이다. 세션이 없어도 방문 신청과 예약 조회는 그대로 동작한다.
 * - 관리자 세션과 동일하게 HttpOnly / SameSite=Lax / (운영) Secure 쿠키에 HS256 JWT 를 담는다.
 * - 관리자 세션과 같은 서명키를 쓰므로 `typ` 클레임으로 용도를 구분한다.
 *   관리자 토큰을 회원 쿠키에 넣거나 그 반대로 해도 검증에서 걸러진다.
 * - 세션에는 식별용 최소 정보만 담는다. (비밀번호 해시 등은 절대 담지 않는다)
 */

export { USER_SESSION_COOKIE };

/** 회원 세션 토큰임을 나타내는 클레임 */
export const USER_SESSION_TYPE = 'user';

export type UserSession = {
  userId: number;
  email: string;
  name: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function signUserSessionToken(session: UserSession): Promise<string> {
  const maxAgeSeconds = getSessionMaxAgeMinutes() * 60;
  return new SignJWT({
    typ: USER_SESSION_TYPE,
    email: session.email,
    name: session.name,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(session.userId))
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyUserSessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const userId = Number(payload.sub);
    if (payload.typ !== USER_SESSION_TYPE) return null;
    if (!Number.isInteger(userId) || userId <= 0) return null;

    return {
      userId,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
    };
  } catch {
    // 만료/위조/서명 불일치는 모두 "세션 없음" 으로 취급한다.
    return null;
  }
}

export async function setUserSessionCookie(session: UserSession): Promise<void> {
  const token = await signUserSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set({
    name: USER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionMaxAgeMinutes() * 60,
  });
}

export async function clearUserSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: USER_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** 현재 요청의 회원 세션 (없으면 null) */
export async function getUserSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyUserSessionToken(token);
}
