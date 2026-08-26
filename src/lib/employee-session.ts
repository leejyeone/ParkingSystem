import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { getSessionMaxAgeMinutes, getSessionSecret, isProduction } from '@/lib/env';
import { EMPLOYEE_SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * 직원 세션.
 *
 * - `/employee` 는 로그인 상태여야만 접근할 수 있다(그룹웨어 SSO 연동을 염두에 둔 요구사항).
 * - 방문객 회원(SiteUser) 세션과 완전히 별도의 쿠키·JWT 이다.
 * - 관리자/회원 세션과 같은 서명키를 쓰므로 `typ` 클레임으로 용도를 구분한다.
 */

export { EMPLOYEE_SESSION_COOKIE };

/** 직원 세션 토큰임을 나타내는 클레임 */
export const EMPLOYEE_SESSION_TYPE = 'employee';

export type EmployeeSession = {
  employeeUserId: number;
  email: string;
  name: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function signEmployeeSessionToken(session: EmployeeSession): Promise<string> {
  const maxAgeSeconds = getSessionMaxAgeMinutes() * 60;
  return new SignJWT({
    typ: EMPLOYEE_SESSION_TYPE,
    email: session.email,
    name: session.name,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(session.employeeUserId))
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyEmployeeSessionToken(token: string): Promise<EmployeeSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const employeeUserId = Number(payload.sub);
    if (payload.typ !== EMPLOYEE_SESSION_TYPE) return null;
    if (!Number.isInteger(employeeUserId) || employeeUserId <= 0) return null;

    return {
      employeeUserId,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
    };
  } catch {
    // 만료/위조/서명 불일치는 모두 "세션 없음" 으로 취급한다.
    return null;
  }
}

export async function setEmployeeSessionCookie(session: EmployeeSession): Promise<void> {
  const token = await signEmployeeSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set({
    name: EMPLOYEE_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionMaxAgeMinutes() * 60,
  });
}

export async function clearEmployeeSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: EMPLOYEE_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** 현재 요청의 직원 세션 (없으면 null) */
export async function getEmployeeSession(): Promise<EmployeeSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(EMPLOYEE_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyEmployeeSessionToken(token);
}
