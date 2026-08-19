import { expect, test, type Page } from '@playwright/test';

import { clearMailOutbox, prisma, resetE2eDatabase, tomorrowInput } from './fixtures';

/**
 * 회원(선택 로그인) 흐름 E2E
 *   회원가입 → 마이페이지 → 주차 신청 폼 자동완성 → 신청 → 내 예약 목록
 *   그리고 예약번호로 예약 조회 → 수정
 */

const MEMBER = {
  email: 'e2e-member@example.com',
  password: 'Member!2345',
  name: '김회원',
  company: '대구지사',
  vehicleNo: '34나5678',
};

test.beforeEach(async () => {
  await resetE2eDatabase();
  await clearMailOutbox();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function signUp(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('이메일').fill(MEMBER.email);
  await page.getByLabel('비밀번호').fill(MEMBER.password);
  await page.getByLabel('성명').fill(MEMBER.name);
  await page.getByLabel('방문 상호 또는 소속 지사명').fill(MEMBER.company);
  await page.getByLabel('차량번호').fill(MEMBER.vehicleNo);
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();

  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
}

test('회원가입하면 마이페이지로 이동하고 내 정보가 보인다', async ({ page }) => {
  await signUp(page);

  await expect(page.getByText(`${MEMBER.name}님, 안녕하세요.`)).toBeVisible();
  await expect(page.getByLabel('이메일')).toHaveValue(MEMBER.email);
  await expect(page.getByText('아직 신청한 예약이 없습니다.')).toBeVisible();
});

test('로그인 회원은 신청 폼이 저장된 정보로 자동완성된다', async ({ page }) => {
  await signUp(page);

  await page.goto('/reservations/new');

  await expect(page.getByText('회원 정보로 자동 입력했습니다')).toBeVisible();
  await expect(page.getByLabel('방문 상호 또는 소속 지사명')).toHaveValue(MEMBER.company);
  await expect(page.getByLabel('성명')).toHaveValue(MEMBER.name);
  await expect(page.getByLabel('이메일')).toHaveValue(MEMBER.email);
  await expect(page.getByLabel('차량번호')).toHaveValue(MEMBER.vehicleNo);
});

test('회원이 신청한 예약은 마이페이지 내 예약 목록에 나온다', async ({ page }) => {
  await signUp(page);

  await page.goto('/reservations/new');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByLabel(/개인정보 수집 및 이용에 동의합니다/).check();
  await page.getByRole('button', { name: '주차 신청하기' }).click();

  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  const reservationNo = (await page.getByTestId('reservation-no').textContent())?.trim();

  await page.goto('/mypage');
  await expect(page.getByText('내 예약 (1건)')).toBeVisible();
  await expect(page.getByText(reservationNo!)).toBeVisible();

  const saved = await prisma.parkingReservation.findFirst();
  expect(saved?.userId).not.toBeNull();
});

test('신청 완료 화면에서 예약번호를 복사할 수 있다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/reservations/new');
  await page.getByLabel('방문 상호 또는 소속 지사명').fill('시노펙스');
  await page.getByLabel('성명').fill('홍길동');
  await page.getByLabel('이메일').fill('guest@example.com');
  await page.getByLabel('차량번호').fill('12가3456');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByLabel(/개인정보 수집 및 이용에 동의합니다/).check();
  await page.getByRole('button', { name: '주차 신청하기' }).click();

  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  const reservationNo = (await page.getByTestId('reservation-no').textContent())!.trim();

  const copyButton = page.getByTestId('copy-button').first();
  await expect(copyButton).toBeVisible();
  await copyButton.click();

  await expect(copyButton).toHaveText('복사됨');

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(reservationNo);
});

test('예약번호만으로 예약을 조회하고 수정할 수 있다', async ({ page }) => {
  // 비로그인으로 신청
  await page.goto('/reservations/new');
  await page.getByLabel('방문 상호 또는 소속 지사명').fill('시노펙스');
  await page.getByLabel('성명').fill('홍길동');
  await page.getByLabel('이메일').fill('guest@example.com');
  await page.getByLabel('차량번호').fill('12가3456');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByLabel(/개인정보 수집 및 이용에 동의합니다/).check();
  await page.getByRole('button', { name: '주차 신청하기' }).click();

  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  const reservationNo = (await page.getByTestId('reservation-no').textContent())!.trim();

  // 예약번호만으로 조회
  await page.goto('/reservations/lookup');
  await page.getByLabel('예약번호').fill(reservationNo);
  await page.getByRole('button', { name: '예약 조회하기' }).click();

  await expect(page.getByRole('heading', { name: '내 예약' })).toBeVisible();
  await expect(page).toHaveURL(/\/r\//);
  // 마스킹 없이 원문이 보인다.
  await expect(page.getByText('홍길동')).toBeVisible();
  await expect(page.getByText('12가3456')).toBeVisible();

  // 조회 화면에서 그대로 수정까지 가능하다.
  await page.getByRole('button', { name: '예약 수정하기' }).click();
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(14));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(16));
  await page.getByRole('button', { name: '수정 내용 저장' }).click();

  await expect(page.getByText(/변경된 예약은 다시 관리자 승인/)).toBeVisible();
});

test('없는 예약번호는 조회되지 않는다', async ({ page }) => {
  await page.goto('/reservations/lookup');
  await page.getByLabel('예약번호').fill('PK-20260820-ZZZZZZ');
  await page.getByRole('button', { name: '예약 조회하기' }).click();

  await expect(page.getByText(/해당 예약번호를 찾을 수 없습니다/)).toBeVisible();
});

test('비로그인 상태로 마이페이지에 접근하면 회원 로그인 페이지로 이동한다', async ({ page }) => {
  await page.goto('/mypage');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  // 관리자 로그인 페이지로 새지 않아야 한다.
  await expect(page).not.toHaveURL(/\/admin/);
});
