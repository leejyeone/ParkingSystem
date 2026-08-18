import { expect, test } from '@playwright/test';

import {
  ADMIN_LOGIN_ID,
  ADMIN_PASSWORD,
  clearMailOutbox,
  prisma,
  resetE2eDatabase,
  tomorrowInput,
  waitForAccessUrl,
} from './fixtures';

/**
 * 사용자 흐름 E2E
 *   방문객 예약 신청 → 관리자 로그인 → 승인 및 주차면 배정 → 상세 확인
 *   → 이메일 링크로 예약 조회 → 예약 수정 → 재승인
 *
 * 이메일은 FileEmailProvider(.mail-outbox)로 대체한다.
 */

const REQUESTER_EMAIL = 'e2e-visitor@example.com';

test.beforeEach(async () => {
  await resetE2eDatabase();
  await clearMailOutbox();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function submitReservation(page: import('@playwright/test').Page) {
  await page.goto('/reservations/new');

  await page.getByRole('radio', { name: '방문객' }).click();
  await page.getByLabel('방문 상호 또는 소속 지사명').fill('시노펙스');
  await page.getByLabel('성명').fill('홍길동');
  await page.getByLabel('이메일').fill(REQUESTER_EMAIL);
  await page.getByLabel('휴대전화 번호').fill('010-1234-5678');
  await page.getByLabel('차량번호').fill('12가 3456');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByLabel(/개인정보 수집 및 이용에 동의합니다/).check();

  await page.getByRole('button', { name: '주차 신청하기' }).click();
}

/** 이미 로그인되어 있으면 로그인 화면이 대시보드로 리다이렉트되므로 그대로 진행한다. */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');

  const loginIdField = page.getByLabel('로그인 ID');
  if ((await loginIdField.count()) > 0) {
    await loginIdField.fill(ADMIN_LOGIN_ID);
    await page.getByLabel('비밀번호').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
  }

  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
}

/**
 * 승인 대기 예약의 상세 화면으로 이동한다.
 * 대시보드는 "오늘" 기준이므로, 날짜와 무관하게 조회되는 예약 목록을 사용한다.
 */
async function openPendingReservationDetail(page: import('@playwright/test').Page) {
  await page.goto('/admin/reservations?status=REQUESTED');
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
  await page.getByRole('link', { name: '상세' }).first().click();
  await expect(page.getByRole('heading', { name: /^PK-/ })).toBeVisible();
}

test('방문객이 주차를 신청하면 예약번호와 승인 대기 상태가 표시된다', async ({ page }) => {
  await submitReservation(page);

  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  await expect(page.getByTestId('reservation-no')).toHaveText(/^PK-\d{8}-[A-Z2-9]{6}$/);
  await expect(page.getByText('승인 대기')).toBeVisible();
  await expect(page.getByText(/접수 확인 메일을 보냈습니다/)).toBeVisible();

  // 차량번호는 공백이 제거되어 저장된다.
  const reservation = await prisma.parkingReservation.findFirst();
  expect(reservation?.vehicleNo).toBe('12가3456');
});

test('예약 조회는 이메일 링크로만 가능하다 (예약번호 입력 화면 없음)', async ({ page }) => {
  await page.goto('/reservations/lookup');

  await expect(page.getByText('예약 조회는 이메일 링크로만 가능합니다')).toBeVisible();
  // 예약번호를 입력해 조회하는 입력창이 존재하지 않아야 한다.
  await expect(page.locator('input[name="reservationNo"]')).toHaveCount(0);
});

test('관리자가 로그인해 예약을 승인하고 주차면을 배정한다', async ({ page }) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await loginAsAdmin(page);
  await openPendingReservationDetail(page);

  // 상세 화면에서 시스템 추천 위치가 안내된다.
  await expect(page.getByText('시스템 추천 위치')).toBeVisible();

  await page.getByRole('button', { name: '승인 및 위치 확정' }).click();
  await expect(page.getByText('처리되었습니다.')).toBeVisible();

  await expect(page.getByTestId('status-badge').first()).toHaveText('승인 완료');

  const reservation = await prisma.parkingReservation.findFirst({
    include: { assignedSpace: true },
  });
  expect(reservation?.reservationStatus).toBe('APPROVED');
  expect(reservation?.assignedSpace?.spaceCode).toBe('A-01');
});

test('신청자가 이메일 링크로 예약을 조회하고 수정하면 다시 승인 대기가 된다', async ({ page }) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  // 관리자가 먼저 승인
  await loginAsAdmin(page);
  await openPendingReservationDetail(page);
  await page.getByRole('button', { name: '승인 및 위치 확정' }).click();
  await expect(page.getByText('처리되었습니다.')).toBeVisible();

  // 신청자는 이메일 링크로 자기 예약 1건을 조회
  const accessUrl = await waitForAccessUrl(REQUESTER_EMAIL);
  await page.goto(accessUrl);

  await expect(page.getByRole('heading', { name: '내 예약' })).toBeVisible();
  await expect(page.getByText('승인 완료')).toBeVisible();

  // 수정하면 승인 대기로 되돌아가고 배정 위치가 해제된다.
  await page.getByRole('button', { name: '예약 수정하기' }).click();
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(14));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(16));
  await page.getByRole('button', { name: '수정 내용 저장' }).click();

  await expect(page.getByText(/변경된 예약은 다시 관리자 승인/)).toBeVisible();
  await expect(page.getByText('승인 대기')).toBeVisible();

  const afterUpdate = await prisma.parkingReservation.findFirst();
  expect(afterUpdate?.reservationStatus).toBe('REQUESTED');
  expect(afterUpdate?.assignedSpaceId).toBeNull();

  // 관리자가 재승인
  await loginAsAdmin(page);
  await openPendingReservationDetail(page);
  await page.getByRole('button', { name: '승인 및 위치 확정' }).click();
  await expect(page.getByText('처리되었습니다.')).toBeVisible();

  const reApproved = await prisma.parkingReservation.findFirst();
  expect(reApproved?.reservationStatus).toBe('APPROVED');
  expect(reApproved?.assignedSpaceId).not.toBeNull();
});

test('유효하지 않은 토큰으로는 예약을 볼 수 없다', async ({ page }) => {
  await page.goto(`/r/${'x'.repeat(43)}`);

  await expect(page.getByText('유효하지 않거나 만료된 링크입니다')).toBeVisible();
});

test('미인증 상태로 관리자 화면에 접근하면 로그인 페이지로 이동한다', async ({ page }) => {
  await page.goto('/admin/reservations');

  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
});
