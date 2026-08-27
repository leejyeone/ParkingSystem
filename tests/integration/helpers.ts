import { AccountStatus, PrismaClient, SpaceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS, toSettingRows } from '@/domain/system-settings';
import { installMockEmailProvider } from '@/lib/email/email-provider-factory';
import type { MockEmailProvider } from '@/lib/email/mock-email-provider';
import { zonedInputToUtc } from '@/lib/datetime';

/**
 * 통합 테스트 공용 헬퍼.
 * 실제 MySQL 테스트 DB 를 사용하며, 테스트마다 데이터를 초기화한다.
 */

export const prisma = new PrismaClient();

/** 자식 → 부모 순으로 삭제 (FK 제약 회피) */
export async function resetDatabase(): Promise<void> {
  await prisma.emailSendLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminLoginAttempt.deleteMany();
  await prisma.parkingReservationStatusLog.deleteMany();
  await prisma.reservationAccessToken.deleteMany();
  await prisma.parkingReservation.deleteMany();
  await prisma.siteUser.deleteMany();
  await prisma.employeeUser.deleteMany();
  await prisma.parkingSpace.deleteMany();
  await prisma.parkingArea.deleteMany();
  await prisma.adminNotificationEmail.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.adminUser.deleteMany();
}

export type TestFixtures = {
  adminId: number;
  secondAdminId: number;
  areaId: number;
  normalSpaceIds: number[];
  doubleSpaceIds: number[];
  mail: MockEmailProvider;
};

/**
 * 기본 픽스처를 만든다.
 * 배정 로직 검증을 쉽게 하기 위해 일반 주차면 수는 인자로 조절할 수 있다.
 */
export async function seedFixtures(options: { normalSpaces?: number } = {}): Promise<TestFixtures> {
  const normalSpaceCount = options.normalSpaces ?? 2;

  const admin = await prisma.adminUser.create({
    data: {
      passwordHash: await bcrypt.hash('Admin!2345', 10),
      adminName: '시스템관리자',
      email: 'sysadmin@example.com',
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const secondAdmin = await prisma.adminUser.create({
    data: {
      passwordHash: await bcrypt.hash('Parking!2345', 10),
      adminName: '주차관리자',
      email: 'parkadmin@example.com',
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const area = await prisma.parkingArea.create({
    data: { areaCode: 'MAIN', areaName: '본사 주차장', displayOrder: 1, isActive: true },
  });

  const normalSpaceIds: number[] = [];
  for (let index = 1; index <= normalSpaceCount; index += 1) {
    const space = await prisma.parkingSpace.create({
      data: {
        areaId: area.areaId,
        spaceCode: `A-${String(index).padStart(2, '0')}`,
        spaceType: SpaceType.NORMAL,
        displayOrder: index,
        isActive: true,
      },
    });
    normalSpaceIds.push(space.spaceId);
  }

  const doubleSpaceIds: number[] = [];
  for (let index = 1; index <= 2; index += 1) {
    const space = await prisma.parkingSpace.create({
      data: {
        areaId: area.areaId,
        spaceCode: `D-${String(index).padStart(2, '0')}`,
        spaceType: SpaceType.DOUBLE,
        displayOrder: 100 + index,
        isActive: true,
      },
    });
    doubleSpaceIds.push(space.spaceId);
  }

  for (const row of toSettingRows(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.create({
      data: {
        settingKey: row.settingKey,
        settingValue: row.settingValue,
        description: SETTING_DESCRIPTIONS[row.settingKey],
      },
    });
  }

  await prisma.adminNotificationEmail.create({
    data: {
      email: 'notify@example.com',
      recipientName: '알림 수신자',
      isActive: true,
      receiveNewRequest: true,
      receiveApprovalAlert: true,
    },
  });

  return {
    adminId: admin.adminUserId,
    secondAdminId: secondAdmin.adminUserId,
    areaId: area.areaId,
    normalSpaceIds,
    doubleSpaceIds,
    mail: installMockEmailProvider(),
  };
}

/**
 * 운영시간(07:00~22:00) 안이면서 지금으로부터 충분히 미래인 방문 시간대를 만든다.
 * 오늘 기준으로 만들면 테스트 실행 시각에 따라 60분 규칙에 걸릴 수 있으므로 항상 내일 이후를 쓴다.
 */
export function futureVisitRange(
  options: { daysFromToday?: number; startHour?: number; hours?: number } = {},
): { visitStartAt: Date; visitEndAt: Date } {
  const { daysFromToday = 1, startHour = 10, hours = 2 } = options;

  const base = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  const dateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);

  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    visitStartAt: zonedInputToUtc(`${dateString}T${pad(startHour)}:00`),
    visitEndAt: zonedInputToUtc(`${dateString}T${pad(startHour + hours)}:00`),
  };
}

/**
 * 직원 계정 픽스처. 방문객(SiteUser)과 완전히 별도 테이블이라 이메일이 겹쳐도 서로 무관하다.
 * 비밀번호가 없는 사번 기반 로그인이라, 시드 스크립트가 명부를 심어 두는 것과 같은
 * 모양으로 employeeCode 만으로 계정을 만든다.
 */
export async function seedEmployeeFixture(
  overrides: Partial<{
    email: string;
    employeeCode: string;
    name: string;
    departmentName: string;
  }> = {},
): Promise<{ employeeUserId: number; email: string; employeeCode: string }> {
  const email = overrides.email ?? 'employee@example.com';
  const employeeCode = overrides.employeeCode ?? `E${Math.floor(Math.random() * 1_000_000)}`;

  const employee = await prisma.employeeUser.create({
    data: {
      email,
      employeeCode,
      name: overrides.name ?? '김직원',
      departmentName: overrides.departmentName ?? '시노펙스 본사',
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  return { employeeUserId: employee.employeeUserId, email, employeeCode };
}

export function baseReservationInput(overrides: Record<string, unknown> = {}) {
  const range = futureVisitRange();
  return {
    requesterType: 'VISITOR' as const,
    companyOrBranchName: '시노펙스',
    requesterName: '홍길동',
    requesterEmail: 'hong@example.com',
    vehicleNo: '12가3456',
    visitPurpose: '회의 참석',
    requestMemo: null,
    visitStartAt: range.visitStartAt,
    visitEndAt: range.visitEndAt,
    privacyConsent: true,
    ...overrides,
  };
}
