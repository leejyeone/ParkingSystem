/**
 * 관리자 계정 + 알림 이메일 → admin_users / admin_notification_emails 주입 스크립트.
 *
 * 실행: npx tsx scripts/import-operators.ts <JSON 경로>
 *
 * `scripts/import-employees.ts`와 같은 이유로 별도 스크립트로 뺐다 — 실명·이메일 같은
 * 개인정보를 git에 커밋되는 `prisma/seed.ts`에 직접 넣지 않기 위해서다. 입력 JSON 파일은
 * 로컬에만 두고 커밋하지 않는다(`.gitignore`의 `*.local.json` 규칙 참고).
 *
 * 입력 JSON 형식:
 * {
 *   "admins": [
 *     { "email": "a@x.com", "name": "홍길동", "role": "SYSTEM_ADMIN", "accountStatus": "ACTIVE" }
 *   ],
 *   "notificationEmails": [
 *     { "email": "a@x.com", "recipientName": "홍길동", "receiveNewRequest": true, "receiveChangeAlert": true, "isActive": true }
 *   ]
 * }
 *
 * 관리자 계정은 이메일 기준 upsert. 신규 생성 시에만 비밀번호를 발급하고(env
 * `OPERATOR_IMPORT_DEFAULT_PASSWORD`, 미지정 시 seed 와 동일한 안내용 기본값),
 * 이미 존재하는 계정의 비밀번호 해시는 절대 덮어쓰지 않는다 — `prisma/seed.ts`의
 * `seedAdminUser()`와 같은 안전장치. 여러 번 실행해도 안전하다.
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AccountStatus, AdminRole, PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

type AdminRow = {
  email: string;
  name: string;
  role: 'SYSTEM_ADMIN' | 'PARKING_ADMIN';
  accountStatus?: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
};

type NotificationEmailRow = {
  email: string;
  recipientName?: string | null;
  receiveNewRequest?: boolean;
  receiveChangeAlert?: boolean;
  isActive?: boolean;
};

type OperatorsFile = {
  admins?: AdminRow[];
  notificationEmails?: NotificationEmailRow[];
};

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value !== '' ? value : fallback;
}

function readOperatorsFile(path: string): OperatorsFile {
  const raw = readFileSync(resolve(path), 'utf-8');
  return JSON.parse(raw) as OperatorsFile;
}

async function importAdmins(rows: AdminRow[]): Promise<void> {
  const defaultPassword = env('OPERATOR_IMPORT_DEFAULT_PASSWORD', 'Operator!2345');
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !row.name || !row.role) {
      console.warn(`건너뜀 (필수값 누락): ${JSON.stringify(row)}`);
      skipped += 1;
      continue;
    }

    const existing = await prisma.adminUser.findUnique({
      where: { email },
      select: { adminUserId: true },
    });

    await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        adminName: row.name,
        role: AdminRole[row.role],
        accountStatus: AccountStatus[row.accountStatus ?? 'ACTIVE'],
        passwordHash: await hashPassword(defaultPassword),
        passwordChangedAt: new Date(),
      },
      // 비밀번호 해시는 절대 덮어쓰지 않는다 — 운영 중 재실행 사고 방지.
      update: {
        adminName: row.name,
        role: AdminRole[row.role],
        accountStatus: AccountStatus[row.accountStatus ?? 'ACTIVE'],
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(
    `✔ 관리자 계정: 신규 ${created}건(임시 비밀번호 발급), 갱신 ${updated}건, 건너뜀 ${skipped}건.`,
  );
}

async function importNotificationEmails(rows: NotificationEmailRow[]): Promise<void> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      console.warn(`건너뜀 (이메일 누락): ${JSON.stringify(row)}`);
      skipped += 1;
      continue;
    }

    const existing = await prisma.adminNotificationEmail.findUnique({
      where: { email },
      select: { notificationEmailId: true },
    });

    await prisma.adminNotificationEmail.upsert({
      where: { email },
      create: {
        email,
        recipientName: row.recipientName ?? null,
        receiveNewRequest: row.receiveNewRequest ?? true,
        receiveChangeAlert: row.receiveChangeAlert ?? true,
        isActive: row.isActive ?? true,
      },
      update: {
        recipientName: row.recipientName ?? null,
        receiveNewRequest: row.receiveNewRequest ?? true,
        receiveChangeAlert: row.receiveChangeAlert ?? true,
        isActive: row.isActive ?? true,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`✔ 알림 이메일: 신규 ${created}건, 갱신 ${updated}건, 건너뜀 ${skipped}건.`);
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('사용법: npx tsx scripts/import-operators.ts <JSON 경로>');
    process.exit(1);
  }

  const file = readOperatorsFile(jsonPath);
  await importAdmins(file.admins ?? []);
  await importNotificationEmails(file.notificationEmails ?? []);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
