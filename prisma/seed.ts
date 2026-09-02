/**
 * Prisma Seed
 *
 * 실행: npm run db:seed  (내부적으로 `prisma db seed` → tsx prisma/seed.ts)
 *
 * 생성 데이터
 *   1) 관리자 계정 1개 (환경변수 기반, 기본값 admin)
 *   2) 주차장 구역 (MAIN / 지하 1층, 65면) + (GROUND / 지상 1층, 6면)
 *   3) 시스템 설정 초기값
 *   4) 관리자 알림 이메일 (환경변수 기반 예시값)
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
  const password = env('SEED_ADMIN_PASSWORD', 'Admin!2345');
  const adminName = env('SEED_ADMIN_NAME', '시스템관리자');
  const email = env('SEED_ADMIN_EMAIL', 'admin@example.com').toLowerCase();

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      passwordHash,
      adminName,
      email,
      role: AdminRole.SYSTEM_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      passwordChangedAt: new Date(),
    },
    // 이미 존재하면 비밀번호는 덮어쓰지 않는다. (운영 중 seed 재실행 사고 방지)
    update: { adminName },
    select: { adminUserId: true, email: true },
  });

  console.log(`✔ 관리자 계정 준비 완료 (email: ${admin.email})`);
  return admin.adminUserId;
}

/**
 * 지하 1층 주차 구역 구성.
 *
 * 실제 도면(동탄사업장 지하 1층 LAYOUT)에서 확인한 65면(일반 59면 + 이중주차 6면)을
 * 그대로 반영한다. 주차면 규격은 2,300 x 5,000mm 이며, 블록은 기둥으로 끊긴 단위다.
 * 번호는 램프(우측)에서 가까운 블록부터 붙여, 자동 배정이 진입 동선 순서를 따르게 한다.
 *
 * 아래 구역은 비활성(사용 불가)으로 시작한다.
 *  - B1-01~07  : 임원 전용 구역
 *  - B1-28~39  : 동탄 직원 전용 구역
 *  - B1-43~59  : 자재 적치 중
 *  - B1-60~65  : 이중주차 미사용(시스템 설정 DOUBLE_PARKING_ENABLED 꺼짐)
 * 관리자가 [시스템 설정] → [구역·주차면] 에서 언제든 다시 활성화할 수 있다.
 */
const B1_TOTAL_SPACES = 65;
/** 이 번호부터는 이중주차(DOUBLE) 구역이다. */
const B1_DOUBLE_FROM = 60;
const B1_INACTIVE_RANGES: readonly [number, number][] = [
  [1, 7],
  [28, 39],
  [43, 59],
  [60, 65],
];

const B1_INACTIVE_MEMOS: readonly [number, number, string][] = [
  [1, 7, '임원 전용 구역'],
  [28, 39, '동탄 직원 전용 구역'],
  [43, 59, '자재 적치 중'],
  [60, 65, '이중주차 미사용(DOUBLE_PARKING_ENABLED 꺼짐)'],
];

function b1IsActive(order: number): boolean {
  return !B1_INACTIVE_RANGES.some(([start, end]) => order >= start && order <= end);
}

function b1Memo(order: number): string | null {
  const match = B1_INACTIVE_MEMOS.find(([start, end]) => order >= start && order <= end);
  return match ? match[2] : null;
}

async function seedAreaAndSpaces(): Promise<void> {
  const area = await prisma.parkingArea.upsert({
    where: { areaCode: 'MAIN' },
    create: {
      areaCode: 'MAIN',
      areaName: '동탄사업장 지하 1층',
      description: '지하 1층 주차장 (65면, 이중주차 6면 포함)',
      displayOrder: 1,
      isActive: true,
    },
    update: { areaName: '동탄사업장 지하 1층', isActive: true },
    select: { areaId: true },
  });

  for (let order = 1; order <= B1_TOTAL_SPACES; order += 1) {
    const spaceCode = `B1-${String(order).padStart(2, '0')}`;
    const spaceType = order >= B1_DOUBLE_FROM ? SpaceType.DOUBLE : SpaceType.NORMAL;
    const isActive = b1IsActive(order);
    const memo = b1Memo(order);
    await prisma.parkingSpace.upsert({
      where: { areaId_spaceCode: { areaId: area.areaId, spaceCode } },
      create: {
        areaId: area.areaId,
        spaceCode,
        spaceType,
        displayOrder: order,
        isActive,
        memo,
      },
      update: { spaceType, displayOrder: order, isActive, memo },
    });
  }

  console.log(`✔ 주차 구역(MAIN) / 주차면 ${B1_TOTAL_SPACES}면 준비 완료`);
}

/**
 * 지상 1층 주차 구역 구성.
 *
 * 식당 좌측에 있는 별도 주차 구역이다. 일반 3면(1F-01, 1F-05, 1F-06) + 장애인 3면
 * (1F-02~04), 총 6면뿐이라 지하 1층처럼 블록 단위로 생성하지 않고 좌표를 직접 적는다.
 */
async function seedGroundFloorAreaAndSpaces(): Promise<void> {
  const area = await prisma.parkingArea.upsert({
    where: { areaCode: 'GROUND' },
    create: {
      areaCode: 'GROUND',
      areaName: '1층 지상 주차장',
      description: '지상 1층 주차장 (6면, 식당 좌측)',
      displayOrder: 2,
      isActive: true,
    },
    update: { areaName: '1층 지상 주차장', isActive: true },
    select: { areaId: true },
  });

  const spaces: readonly { spaceCode: string; spaceType: SpaceType }[] = [
    { spaceCode: '1F-01', spaceType: SpaceType.NORMAL },
    { spaceCode: '1F-02', spaceType: SpaceType.DISABLED },
    { spaceCode: '1F-03', spaceType: SpaceType.DISABLED },
    { spaceCode: '1F-04', spaceType: SpaceType.DISABLED },
    { spaceCode: '1F-05', spaceType: SpaceType.NORMAL },
    { spaceCode: '1F-06', spaceType: SpaceType.NORMAL },
  ];

  for (const [index, space] of spaces.entries()) {
    const displayOrder = index + 1;
    await prisma.parkingSpace.upsert({
      where: { areaId_spaceCode: { areaId: area.areaId, spaceCode: space.spaceCode } },
      create: {
        areaId: area.areaId,
        spaceCode: space.spaceCode,
        spaceType: space.spaceType,
        displayOrder,
        isActive: true,
      },
      update: { spaceType: space.spaceType, displayOrder, isActive: true },
    });
  }

  console.log(`✔ 주차 구역(GROUND) / 주차면 ${spaces.length}면 준비 완료`);
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
        receiveChangeAlert: true,
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
  await seedGroundFloorAreaAndSpaces();
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
