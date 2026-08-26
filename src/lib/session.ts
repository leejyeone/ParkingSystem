import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { getSessionMaxAgeMinutes, getSessionSecret, isProduction } from '@/lib/env';
import { ADMIN_SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * 관리자 세션.
 *
 * - HttpOnly / SameSite=Lax / (운영) Secure 쿠키에 HS256 서명 JWT 를 담는다.
 * - 만료(exp)는 SESSION_MAX_AGE_MINUTES 기준이며 쿠키 maxAge 와 동일하게 맞춘다.
 * - 세션에는 식별에 필요한 최소 정보만 담는다.
 * - 회원 세션과 같은 서명키를 쓰므로 `typ` 클레임으로 토큰 용도를 구분한다.
 *   (회원 토큰을 관리자 쿠키에 넣어도 통과하지 않도록)
 */

export { ADMIN_SESSION_COOKIE };

/** 관리자 세션 토큰임을 나타내는 클레임 */
export const ADMIN_SESSION_TYPE = 'admin';

export type AdminSession = {
  adminUserId: number;
  email: string;
  adminName: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function signAdminSessionToken(session: AdminSession): Promise<string> {
  const maxAgeSeconds = getSessionMaxAgeMinutes() * 60;
  return new SignJWT({
    typ: ADMIN_SESSION_TYPE,
    email: session.email,
    adminName: session.adminName,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(session.adminUserId))
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const adminUserId = Number(payload.sub);
    if (payload.typ !== ADMIN_SESSION_TYPE) return null;
    if (!Number.isInteger(adminUserId) || adminUserId <= 0) return null;

    return {
      adminUserId,
      email: String(payload.email ?? ''),
      adminName: String(payload.adminName ?? ''),
    };
  } catch {
    // 만료/위조/서명 불일치는 모두 "세션 없음" 으로 취급한다.
    return null;
  }
}

/** 로그인 성공 시 세션 쿠키를 설정한다. */
export async function setAdminSessionCookie(session: AdminSession): Promise<void> {
  const token = await signAdminSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionMaxAgeMinutes() * 60,
  });
}

/** 로그아웃 시 세션 쿠키를 제거한다. */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** 현재 요청의 관리자 세션 (없으면 null) */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}
