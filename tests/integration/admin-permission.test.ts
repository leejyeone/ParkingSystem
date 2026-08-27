import { AccountStatus, SpaceType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, UnauthorizedError } from '@/lib/errors';
import { verifyPassword } from '@/lib/password';
import { loginAdmin, MAX_LOGIN_FAILURES, requireActiveAdmin } from '@/services/admin-auth-service';
import { createAdminUser, listAdminUsers, updateAdminUser } from '@/services/admin-user-service';
import { createParkingSpace, updateParkingSpace } from '@/services/parking-space-service';
import { getSystemSettings, updateSystemSettings } from '@/services/settings-service';
import { prisma, resetDatabase, seedFixtures, type TestFixtures } from './helpers';

/**
 * 관리자 로그인 및 관리자 계정/주차면 관리 시나리오.
 *
 * 관리자는 단일 권한만 존재하며 계정 간 권한 차이는 없다.
 * requireActiveAdmin() 은 next/headers 의 쿠키에 의존하므로,
 * 여기서는 세션 조회 부분만 모킹하고 판정 로직 자체를 검증한다.
 */

const sessionMock = vi.hoisted(() => ({ getAdminSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  return { ...actual, getAdminSession: sessionMock.getAdminSession };
});

let fixtures: TestFixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedFixtures({ normalSpaces: 2 });
  sessionMock.getAdminSession.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('관리자 로그인', () => {
  it('올바른 자격 증명으로 로그인하면 세션 정보를 반환한다', async () => {
    const session = await loginAdmin({ email: 'sysadmin@example.com', password: 'Admin!2345' });

    expect(session.adminUserId).toBe(fixtures.adminId);

    const admin = await prisma.adminUser.findUnique({ where: { email: 'sysadmin@example.com' } });
    expect(admin?.lastLoginAt).not.toBeNull();
    expect(admin?.loginFailCount).toBe(0);
  });

  it('비밀번호가 틀리면 실패 횟수가 증가한다', async () => {
    await expect(
      loginAdmin({ email: 'sysadmin@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const admin = await prisma.adminUser.findUnique({ where: { email: 'sysadmin@example.com' } });
    expect(admin?.loginFailCount).toBe(1);
  });

  it(`실패가 ${MAX_LOGIN_FAILURES}회 누적되면 계정이 잠긴다`, async () => {
    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt += 1) {
      await loginAdmin({ email: 'sysadmin@example.com', password: 'wrong' }).catch(() => undefined);
    }

    const admin = await prisma.adminUser.findUnique({ where: { email: 'sysadmin@example.com' } });
    expect(admin?.accountStatus).toBe(AccountStatus.LOCKED);
    expect(admin?.lockedUntil).not.toBeNull();

    // 잠긴 뒤에는 올바른 비밀번호로도 로그인할 수 없다.
    await expect(
      loginAdmin({ email: 'sysadmin@example.com', password: 'Admin!2345' }),
    ).rejects.toThrowError(/잠금/);
  });

  it('존재하지 않는 계정도 동일한 메시지로 응답한다', async () => {
    const unknown = await loginAdmin({ email: 'nobody@example.com', password: 'x' }).catch(
      (error: Error) => error.message,
    );
    const wrongPassword = await loginAdmin({
      email: 'sysadmin@example.com',
      password: 'x',
    }).catch((error: Error) => error.message);

    expect(unknown).toBe(wrongPassword);
  });

  it('모든 로그인 시도가 기록된다', async () => {
    await loginAdmin({ email: 'sysadmin@example.com', password: 'Admin!2345' });
    await loginAdmin({ email: 'sysadmin@example.com', password: 'wrong' }).catch(() => undefined);

    const attempts = await prisma.adminLoginAttempt.findMany({
      orderBy: { loginAttemptId: 'asc' },
    });
    expect(attempts.map((attempt) => attempt.succeeded)).toEqual([true, false]);
  });
});

describe('관리자 세션 검증', () => {
  it('비활성화된 계정은 세션이 있어도 차단된다', async () => {
    await prisma.adminUser.update({
      where: { adminUserId: fixtures.secondAdminId },
      data: { accountStatus: AccountStatus.INACTIVE },
    });
    sessionMock.getAdminSession.mockResolvedValue({
      adminUserId: fixtures.secondAdminId,
      email: 'parkadmin@example.com',
      adminName: '주차관리자',
    });

    await expect(requireActiveAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('세션이 없으면 차단된다', async () => {
    sessionMock.getAdminSession.mockResolvedValue(null);
    await expect(requireActiveAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('활성 계정은 세션 검증을 통과한다', async () => {
    sessionMock.getAdminSession.mockResolvedValue({
      adminUserId: fixtures.adminId,
      email: 'sysadmin@example.com',
      adminName: '시스템관리자',
    });
    await expect(requireActiveAdmin()).resolves.toMatchObject({ adminUserId: fixtures.adminId });
  });
});

describe('관리자 계정 및 주차면 관리', () => {
  it('시스템 설정을 저장할 수 있다', async () => {
    const before = await getSystemSettings();
    const after = await updateSystemSettings(
      { ...before, reservationMinLeadMinutes: 90, doubleParkingEnabled: false },
      fixtures.adminId,
    );

    expect(after.reservationMinLeadMinutes).toBe(90);
    expect(after.doubleParkingEnabled).toBe(false);
  });

  it('주차면을 생성하고 비활성화할 수 있으며 감사 로그가 남는다', async () => {
    const created = await createParkingSpace(
      {
        areaId: fixtures.areaId,
        spaceCode: 'A-99',
        spaceName: '임시 주차면',
        spaceType: SpaceType.NORMAL,
        displayOrder: 99,
        isActive: true,
        memo: null,
      },
      { adminUserId: fixtures.adminId },
    );
    expect(created.spaceCode).toBe('A-99');

    const updated = await updateParkingSpace(
      created.spaceId,
      { isActive: false },
      { adminUserId: fixtures.adminId },
    );
    expect(updated.isActive).toBe(false);

    const auditActions = (await prisma.auditLog.findMany({ orderBy: { auditLogId: 'asc' } })).map(
      (log) => log.actionType,
    );
    expect(auditActions).toContain('PARKING_SPACE_CREATE');
    expect(auditActions).toContain('PARKING_SPACE_DEACTIVATE');
  });

  it('같은 구역에 중복된 주차면 코드는 만들 수 없다', async () => {
    await expect(
      createParkingSpace(
        {
          areaId: fixtures.areaId,
          spaceCode: 'A-01',
          spaceType: SpaceType.NORMAL,
          displayOrder: 1,
          isActive: true,
        },
        { adminUserId: fixtures.adminId },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('관리자 계정을 생성하면 비밀번호가 해시로 저장된다', async () => {
    const created = await createAdminUser(
      {
        email: 'new@example.com',
        password: 'NewAdmin!2345',
        adminName: '신규관리자',
      },
      { adminUserId: fixtures.adminId },
    );

    const saved = await prisma.adminUser.findUnique({
      where: { adminUserId: created.adminUserId },
    });
    expect(saved?.passwordHash).not.toBe('NewAdmin!2345');
    expect(saved?.passwordHash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('NewAdmin!2345', saved!.passwordHash)).toBe(true);
  });

  it('관리자 계정을 생성하면 그 이메일이 알림 수신자 목록에 자동으로 등록된다', async () => {
    // seedFixtures() 가 이미 'notify@example.com' 을 알림 수신자로 심어 두므로(다른
    // 테스트용 픽스처), 여기서는 그와 겹치지 않는 이메일을 써야 upsert 의 create
    // 경로(신규 등록)를 실제로 검증한다 — 겹치면 update:{} no-op 경로만 타게 된다.
    await createAdminUser(
      {
        email: 'brand-new-notify-admin@example.com',
        password: 'NewAdmin!2345',
        adminName: '알림관리자',
      },
      { adminUserId: fixtures.adminId },
    );

    const notificationEmail = await prisma.adminNotificationEmail.findUnique({
      where: { email: 'brand-new-notify-admin@example.com' },
    });
    expect(notificationEmail).not.toBeNull();
    // 계정 생성만으로 곧바로 실제 메일을 받기 시작하지 않도록 비활성으로 등록된다.
    expect(notificationEmail?.isActive).toBe(false);
    expect(notificationEmail?.receiveNewRequest).toBe(true);
    expect(notificationEmail?.receiveChangeAlert).toBe(true);
  });

  it('이미 알림 수신자로 등록된 이메일로 관리자를 만들어도 기존 수신 설정을 덮어쓰지 않는다', async () => {
    await prisma.adminNotificationEmail.create({
      data: {
        email: 'existing@example.com',
        recipientName: '기존 배포 주소',
        receiveNewRequest: false,
        receiveChangeAlert: false,
        isActive: false,
      },
    });

    await createAdminUser(
      {
        email: 'existing@example.com',
        password: 'NewAdmin!2345',
        adminName: '기존이메일관리자',
      },
      { adminUserId: fixtures.adminId },
    );

    const notificationEmail = await prisma.adminNotificationEmail.findUnique({
      where: { email: 'existing@example.com' },
    });
    expect(notificationEmail?.isActive).toBe(false);
    expect(notificationEmail?.receiveNewRequest).toBe(false);
    expect(notificationEmail?.receiveChangeAlert).toBe(false);
  });

  it('비밀번호 정책을 만족하지 않으면 계정을 만들 수 없다', async () => {
    await expect(
      createAdminUser(
        {
          email: 'weak@example.com',
          password: 'short',
          adminName: '약한비번',
        },
        { adminUserId: fixtures.adminId },
      ),
    ).rejects.toThrowError(/비밀번호/);
  });

  it('목록에는 이메일이 마스킹 없이 그대로 표시된다', async () => {
    const list = await listAdminUsers();
    const sysadmin = list.find((user) => user.email === 'sysadmin@example.com');

    expect(sysadmin?.email).toBe('sysadmin@example.com');
  });

  it('마지막 활성 관리자는 비활성화할 수 없다', async () => {
    await prisma.adminUser.update({
      where: { adminUserId: fixtures.secondAdminId },
      data: { accountStatus: AccountStatus.INACTIVE },
    });

    await expect(
      updateAdminUser(
        fixtures.adminId,
        { accountStatus: AccountStatus.INACTIVE },
        { adminUserId: fixtures.adminId },
      ),
    ).rejects.toThrowError(/활성 상태의 관리자가 최소 1명/);
  });
});
