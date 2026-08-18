import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { AccountStatus, AdminRole, PrismaClient, SpaceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  DEFAULT_SETTINGS,
  SETTING_DESCRIPTIONS,
  toSettingRows,
} from '../../src/domain/system-settings';

/** E2E 공용 픽스처: 테스트 DB 초기화 + 메일 아웃박스 조회 */

export const prisma = new PrismaClient();

export const ADMIN_LOGIN_ID = 'e2eadmin';
export const ADMIN_PASSWORD = 'E2eAdmin!2345';

/** playwright.config.ts 에서 설정한 경로와 동일해야 한다. */
const OUTBOX_DIR = process.env.MAIL_OUTBOX_DIR
  ? path.resolve(process.env.MAIL_OUTBOX_DIR)
  : path.resolve(process.cwd(), '.mail-outbox');

export async function resetE2eDatabase(): Promise<void> {
  await prisma.emailSendLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminLoginAttempt.deleteMany();
  await prisma.parkingReservationStatusLog.deleteMany();
  await prisma.reservationAccessToken.deleteMany();
  await prisma.parkingReservation.deleteMany();
  await prisma.siteUser.deleteMany();
  await prisma.parkingSpace.deleteMany();
  await prisma.parkingArea.deleteMany();
  await prisma.adminNotificationEmail.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.adminUser.deleteMany();

  await prisma.adminUser.create({
    data: {
      loginId: ADMIN_LOGIN_ID,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      adminName: 'E2E관리자',
      email: 'e2e-admin@example.com',
      roleCode: AdminRole.SYSTEM_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const area = await prisma.parkingArea.create({
    data: { areaCode: 'MAIN', areaName: '본사 주차장', displayOrder: 1, isActive: true },
  });

  for (let index = 1; index <= 3; index += 1) {
    await prisma.parkingSpace.create({
      data: {
        areaId: area.areaId,
        spaceCode: `A-${String(index).padStart(2, '0')}`,
        spaceType: SpaceType.NORMAL,
        displayOrder: index,
        isActive: true,
      },
    });
  }
  await prisma.parkingSpace.create({
    data: {
      areaId: area.areaId,
      spaceCode: 'D-01',
      spaceType: SpaceType.DOUBLE,
      displayOrder: 101,
      isActive: true,
    },
  });

  for (const row of toSettingRows(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.create({
      data: {
        settingKey: row.settingKey,
        settingValue: row.settingValue,
        description: SETTING_DESCRIPTIONS[row.settingKey],
      },
    });
  }
}

/** 디렉터리 자체는 지우지 않고 안의 메일 파일만 비운다. */
export async function clearMailOutbox(): Promise<void> {
  await mkdir(OUTBOX_DIR, { recursive: true });
  const files = await readdir(OUTBOX_DIR).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((name) => name.endsWith('.json'))
      .map((name) => rm(path.join(OUTBOX_DIR, name), { force: true })),
  );
}

type OutboxMail = { id: string; to: string; subject: string; html: string; text: string };

export async function readMailOutbox(): Promise<OutboxMail[]> {
  try {
    const files = (await readdir(OUTBOX_DIR)).filter((name) => name.endsWith('.json')).sort();
    return await Promise.all(
      files.map(async (name) => JSON.parse(await readFile(path.join(OUTBOX_DIR, name), 'utf8'))),
    );
  } catch {
    return [];
  }
}

/** 특정 수신자에게 간 메일에서 예약 조회 링크를 추출한다. */
export async function waitForAccessUrl(recipient: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const mails = await readMailOutbox();
    for (const mail of mails.reverse()) {
      if (mail.to !== recipient) continue;
      const match = /https?:\/\/[^\s"'<>]+\/r\/[A-Za-z0-9_-]+/.exec(mail.text);
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`${recipient} 앞으로 예약 조회 링크가 포함된 메일이 도착하지 않았습니다.`);
}

/** 내일 날짜의 'yyyy-MM-ddTHH:mm' (Asia/Seoul) */
export function tomorrowInput(hour: number): string {
  const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
  return `${dateString}T${String(hour).padStart(2, '0')}:00`;
}
