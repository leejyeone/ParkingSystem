import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { AccountStatus, PrismaClient, SpaceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  DEFAULT_SETTINGS,
  SETTING_DESCRIPTIONS,
  toSettingRows,
} from '../../src/domain/system-settings';

/** E2E 공용 픽스처: 테스트 DB 초기화 + 메일 아웃박스 조회 */

export const prisma = new PrismaClient();

export const ADMIN_EMAIL = 'e2eadmin@example.com';
export const ADMIN_PASSWORD = 'E2eAdmin!2345';

/** 방문 신청 폼의 "당사 담당자" 검색에서 고르는 기본 대상. */
export const HOST_EMPLOYEE_NAME = '박담당';
export const HOST_EMPLOYEE_EMAIL = 'e2e-host-employee@example.com';
export const HOST_EMPLOYEE_CODE = 'E-HOST-001';

/** 직원 본인 로그인(사번 진입) 플로우 테스트용 계정. */
export const EMPLOYEE_CODE = 'E-SELF-001';
export const EMPLOYEE_EMAIL = 'e2e-employee@example.com';
export const EMPLOYEE_NAME = '김직원';
export const EMPLOYEE_DEPARTMENT_NAME = '시노펙스 대구사업장';

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
  await prisma.employeeUser.deleteMany();
  await prisma.parkingSpace.deleteMany();
  await prisma.parkingArea.deleteMany();
  await prisma.adminNotificationEmail.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.adminUser.deleteMany();

  await prisma.adminUser.create({
    data: {
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      adminName: 'E2E관리자',
      email: ADMIN_EMAIL,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 방문 신청 폼의 "당사 담당자" 검색·선택 대상. 방문객 신청(회원/비회원 모두)이
  // 이 계정을 검색해서 골라야 신청이 완료된다.
  await prisma.employeeUser.create({
    data: {
      employeeCode: HOST_EMPLOYEE_CODE,
      name: HOST_EMPLOYEE_NAME,
      departmentName: '총무팀',
      email: HOST_EMPLOYEE_EMAIL,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 직원 본인 로그인(사번 진입) 플로우 테스트용 계정.
  await prisma.employeeUser.create({
    data: {
      employeeCode: EMPLOYEE_CODE,
      name: EMPLOYEE_NAME,
      departmentName: EMPLOYEE_DEPARTMENT_NAME,
      email: EMPLOYEE_EMAIL,
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

/**
 * 방문 신청 폼의 "당사 담당자" 검색 콤보박스에서 시드된 담당자를 검색해 선택한다.
 * (`resetE2eDatabase()` 가 만들어 둔 `HOST_EMPLOYEE_NAME` 계정을 고른다)
 */
export async function selectHostEmployee(page: import('@playwright/test').Page): Promise<void> {
  const input = page.getByLabel('당사 담당자');
  await input.fill(HOST_EMPLOYEE_NAME);
  await page.getByRole('button', { name: new RegExp(`^${HOST_EMPLOYEE_NAME}`) }).click();
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

/**
 * 테스트마다 서로 다른 클라이언트 IP 를 흉내 낸다.
 *
 * 신청/조회 API 는 IP 단위 레이트 리밋을 건다(예약 생성 10회 / 10분,
 * src/lib/rate-limit.ts). 리미터는 프로세스 메모리에 있어 DB 초기화로 비워지지 않으므로,
 * 모든 테스트가 같은 IP 로 접속하면 스위트 후반(특히 두 번째 브라우저 프로젝트)에서
 * 한도를 넘겨 실패한다. 실제 환경에서는 방문자마다 IP 가 다르니, 그 조건을 맞춰 준다.
 *
 * 값은 (프로젝트명 + 테스트명) 해시라 재실행해도 같고, 테스트끼리 겹치지 않는다.
 */
export function clientIpFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  // 사설 대역 10.x.y.z 로 만든다. 마지막 옥텟이 0 이면 1 로 올린다.
  return `10.${(hash >>> 16) & 0xff}.${(hash >>> 8) & 0xff}.${hash & 0xff || 1}`;
}
