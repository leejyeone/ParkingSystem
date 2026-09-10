/**
 * 전 직원 명부 .xls → employee_users 1회성(재실행 가능) 주입 스크립트.
 *
 * 실행: npx tsx scripts/import-employees.ts {xls 경로}
 *
 * 원본 엑셀의 1행은 헤더이고, 열 순서는 항상
 *   A=부서, B=직위, C=이름, D=휴대전화, E=전화번호, F=USER ID, G=사번, H=e-Mail
 * 로 고정되어 있다고 전달받았다 — 헤더 문자열로 찾지 않고 절대 열 위치(A~H)로 읽는다.
 * DB에 필요한 건 부서(A)/이름(C)/휴대전화(D, 없으면 전화번호 E)/사번(G)/이메일(H)이고,
 * 직위·USER ID 는 저장할 곳이 없어 무시한다. 전화번호는 "당사 담당자" 확인(이름+전화번호
 * 일치 검증) 비교를 단순하게 하기 위해 숫자만 남겨 저장한다.
 *
 * 그룹웨어 SSO가 아직 붙지 않은 동안, 직원 로그인은 이 표에 심어 둔 사번(employeeCode)
 * 만으로 이루어진다 — 비밀번호는 없다. 사용을 원치 않는 계정을 관리자가 다시 검토해
 * 하나씩 켜기 전까지는 오작동을 막기 위해, 이번에 심는 모든 계정은 처음부터
 * 비활성(INACTIVE)으로 넣는다 — 필요한 사람만 관리자 화면(/admin/employees)에서
 * 활성화한다.
 *
 * 입사자가 생기거나 부서 이동이 있을 때, 최신 명부로 다시 돌려도 안전하다(사번 기준
 * upsert) — 다만 재실행 시에도 계정 상태는 다시 INACTIVE 로 덮어쓰지 않는다(이미 관리자가
 * 활성화해 둔 계정을 되돌리지 않기 위해 신규 생성 시에만 INACTIVE 를 부여한다).
 */
import 'dotenv/config';

import { resolve } from 'node:path';

import { AccountStatus, PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

/** 절대 열 위치(0-based). A=0, C=2, D=3, E=4, G=6, H=7. */
const COLUMN = {
  department: 0,
  name: 2,
  mobile: 3,
  telephone: 4,
  employeeCode: 6,
  email: 7,
} as const;

type Row = {
  departmentName: string;
  name: string;
  phone: string;
  employeeCode: string;
  email: string;
};

/** 하이픈/공백 등을 제거하고 숫자만 남긴다. 검증(verifyHostEmployee) 비교 방식과 맞춰야 한다. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function readRows(xlsPath: string): Row[] {
  const workbook = XLSX.readFile(xlsPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const cells: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // 1행은 헤더이므로 건너뛴다.
  return cells.slice(1).map((cells) => {
    const mobile = digitsOnly(String(cells[COLUMN.mobile] ?? ''));
    const telephone = digitsOnly(String(cells[COLUMN.telephone] ?? ''));
    return {
      departmentName: String(cells[COLUMN.department] ?? '').trim(),
      name: String(cells[COLUMN.name] ?? '').trim(),
      phone: mobile || telephone,
      employeeCode: String(cells[COLUMN.employeeCode] ?? '').trim(),
      email: String(cells[COLUMN.email] ?? '')
        .trim()
        .toLowerCase(),
    };
  });
}

async function main() {
  const xlsPath = process.argv[2];
  if (!xlsPath) {
    console.error('사용법: npx tsx scripts/import-employees.ts <xls 경로>');
    process.exit(1);
  }

  const rows = readRows(resolve(xlsPath));
  console.log(`${rows.length}건의 명부 행을 읽었습니다.`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.employeeCode || !row.email || !row.name) {
      console.warn(`건너뜀 (필수값 누락): ${JSON.stringify(row)}`);
      skipped += 1;
      continue;
    }

    const existing = await prisma.employeeUser.findUnique({
      where: { employeeCode: row.employeeCode },
      select: { employeeUserId: true },
    });

    await prisma.employeeUser.upsert({
      where: { employeeCode: row.employeeCode },
      create: {
        employeeCode: row.employeeCode,
        email: row.email,
        name: row.name,
        departmentName: row.departmentName,
        phone: row.phone || null,
        // 관리자가 검토해 하나씩 켜기 전까지는 비활성으로 심는다.
        accountStatus: AccountStatus.INACTIVE,
      },
      update: {
        email: row.email,
        name: row.name,
        departmentName: row.departmentName,
        phone: row.phone || null,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.log(
    `완료: 신규 ${created}건(모두 비활성으로 등록), 갱신 ${updated}건, 건너뜀 ${skipped}건.`,
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
