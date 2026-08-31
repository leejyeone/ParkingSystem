import { AdminRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { signAdminSessionToken, verifyAdminSessionToken } from '@/lib/session';
import { signUserSessionToken, verifyUserSessionToken } from '@/lib/user-session';

/**
 * 회원 세션과 관리자 세션은 같은 서명키(NEXTAUTH_SECRET)를 쓰므로,
 * `typ` 클레임으로 용도가 구분되는지 반드시 검증한다.
 */

const USER = { userId: 7, email: 'hong@example.com', name: '홍길동' };
const ADMIN = {
  adminUserId: 3,
  email: 'admin@example.com',
  adminName: '시스템관리자',
  role: AdminRole.SYSTEM_ADMIN,
};

describe('회원 세션 토큰', () => {
  it('서명한 토큰을 그대로 복원한다', async () => {
    const token = await signUserSessionToken(USER);
    expect(await verifyUserSessionToken(token)).toEqual(USER);
  });

  it('위조되었거나 형식이 아닌 토큰은 null 을 반환한다', async () => {
    expect(await verifyUserSessionToken('not-a-jwt')).toBeNull();
    expect(await verifyUserSessionToken('')).toBeNull();
  });
});

describe('관리자/회원 토큰 교차 사용 차단', () => {
  it('회원 토큰으로는 관리자 세션이 열리지 않는다', async () => {
    const userToken = await signUserSessionToken(USER);
    expect(await verifyAdminSessionToken(userToken)).toBeNull();
  });

  it('관리자 토큰으로는 회원 세션이 열리지 않는다', async () => {
    const adminToken = await signAdminSessionToken(ADMIN);
    expect(await verifyUserSessionToken(adminToken)).toBeNull();
  });

  it('각자의 토큰은 정상 동작한다', async () => {
    expect(await verifyAdminSessionToken(await signAdminSessionToken(ADMIN))).toMatchObject({
      adminUserId: ADMIN.adminUserId,
    });
    expect(await verifyUserSessionToken(await signUserSessionToken(USER))).toMatchObject({
      userId: USER.userId,
    });
  });
});
