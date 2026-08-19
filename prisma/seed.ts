/**
 * Prisma Seed
 *
 * 실행: npm run db:seed  (내부적으로 `prisma db seed` → tsx prisma/seed.ts)
 *
 * 생성 데이터
 *   1) SYSTEM_ADMIN 계정 1개 (환경변수 기반, 기본값 admin)
 *   2) 주차장 구역 1개 (MAIN / 본사 주차장, 도면은 비워 둠 — 관리자가 직접 업로드)
 *   3) 일반 주차면 17개 (A-01 ~ A-17, NORMAL, display_order 1~17)
 *   4) 이중주차 위치 3개 (D-01 ~ D-03, DOUBLE, display_order 101~103)
 *   5) 시스템 설정 초기값
 *   6) 관리자 알림 이메일 (환경변수 기반 예시값)
 *
 * 모든 upsert 는 멱등이므로 여러 번 실행해도 안전하다.
 */
import 'dotenv/config';

import { AccountStatus, AdminRole, PrismaClient, SpaceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  DEFAULT_SETTINGS,
  SETTING_DESCRIPTIONS,
  toSettingRows,
} from '../src/domain/system-settings';

const prisma = new PrismaClient();

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value !== '' ? value : fallback;
}

async function seedAdminUser(): Promise<number> {
  const loginId = env('SEED_ADMIN_LOGIN_ID', 'admin');
  const password = env('SEED_ADMIN_PASSWORD', 'Admin!2345');
  const adminName = env('SEED_ADMIN_NAME', '시스템관리자');
  const email = env('SEED_ADMIN_EMAIL', 'admin@example.com').toLowerCase();

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { loginId },
    create: {
      loginId,
      passwordHash,
      adminName,
      email,
      roleCode: AdminRole.SYSTEM_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      passwordChangedAt: new Date(),
    },
    // 이미 존재하면 비밀번호는 덮어쓰지 않는다. (운영 중 seed 재실행 사고 방지)
    update: { adminName, email, roleCode: AdminRole.SYSTEM_ADMIN },
    select: { adminUserId: true, loginId: true },
  });

  console.log(`✔ SYSTEM_ADMIN 계정 준비 완료 (loginId: ${admin.loginId})`);
  return admin.adminUserId;
}

async function seedAreaAndSpaces(): Promise<void> {
  const area = await prisma.parkingArea.upsert({
    where: { areaCode: 'MAIN' },
    create: {
      areaCode: 'MAIN',
      areaName: '본사 주차장',
      description: '본사 사옥 지상 주차장 (일반 17면 + 이중주차 3면)',
      displayOrder: 1,
      isActive: true,
    },
    update: { areaName: '본사 주차장', isActive: true },
    select: { areaId: true },
  });

  // 일반 주차면 A-01 ~ A-17
  for (let index = 1; index <= 17; index += 1) {
    const spaceCode = `A-${String(index).padStart(2, '0')}`;
    await prisma.parkingSpace.upsert({
      where: { areaId_spaceCode: { areaId: area.areaId, spaceCode } },
      create: {
        areaId: area.areaId,
        spaceCode,
        spaceName: `일반 ${index}번`,
        spaceType: SpaceType.NORMAL,
        displayOrder: index,
        isActive: true,
      },
      update: { spaceType: SpaceType.NORMAL, displayOrder: index, isActive: true },
    });
  }

  // 이중주차 위치 D-01 ~ D-03
  for (let index = 1; index <= 3; index += 1) {
    const spaceCode = `D-${String(index).padStart(2, '0')}`;
    await prisma.parkingSpace.upsert({
      where: { areaId_spaceCode: { areaId: area.areaId, spaceCode } },
      create: {
        areaId: area.areaId,
        spaceCode,
        spaceName: `이중주차 ${index}번`,
        spaceType: SpaceType.DOUBLE,
        displayOrder: 100 + index,
        isActive: true,
        memo: '앞 차량 출차 시 이동 요청이 필요할 수 있는 위치',
      },
      update: { spaceType: SpaceType.DOUBLE, displayOrder: 100 + index, isActive: true },
    });
  }

  console.log('✔ 주차 구역(MAIN) / 일반 17면 / 이중주차 3면 준비 완료');
}

async function seedSystemSettings(adminUserId: number): Promise<void> {
  for (const row of toSettingRows(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { settingKey: row.settingKey },
      create: {
        settingKey: row.settingKey,
        settingValue: row.settingValue,
        description: SETTING_DESCRIPTIONS[row.settingKey],
        updatedByAdminId: adminUserId,
      },
      // 이미 운영 중인 값은 덮어쓰지 않고 설명만 최신화한다.
      update: { description: SETTING_DESCRIPTIONS[row.settingKey] },
    });
  }
  console.log('✔ 시스템 설정 초기값 준비 완료');
}

async function seedNotificationEmails(): Promise<void> {
  const emails = env('SEED_ADMIN_NOTIFICATION_EMAILS', 'parking-admin@example.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== '');

  for (const email of emails) {
    await prisma.adminNotificationEmail.upsert({
      where: { email },
      create: {
        email,
        recipientName: '주차 관리 담당자',
        receiveNewRequest: true,
        receiveApprovalAlert: true,
        receiveDoubleParkingAlert: true,
        isActive: true,
      },
      update: { isActive: true },
    });
  }

  console.log(`✔ 관리자 알림 이메일 ${emails.length}건 준비 완료 (예시값)`);
}

async function main(): Promise<void> {
  console.log('▶ Seed 시작');

  const adminUserId = await seedAdminUser();
  await seedAreaAndSpaces();
  await seedSystemSettings(adminUserId);
  await seedNotificationEmails();

  console.log('');
  console.log('────────────────────────────────────────────');
  console.log('⚠ 보안 경고');
  console.log('  Seed 로 생성된 초기 관리자 비밀번호는 개발 편의를 위한 값입니다.');
  console.log('  최초 로그인 직후 [시스템 설정 > 관리자 계정] 에서 반드시 변경하세요.');
  console.log(
    '  운영 환경에서는 SEED_ADMIN_PASSWORD 환경변수로 강력한 임시 비밀번호를 지정하세요.',
  );
  console.log('────────────────────────────────────────────');
  console.log('▶ Seed 완료');
}

main()
  .catch((error) => {
    console.error('Seed 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
