import { expect, test } from '@playwright/test';

import {
  clearMailOutbox,
  clientIpFor,
  EMPLOYEE_CODE,
  EMPLOYEE_DEPARTMENT_NAME,
  EMPLOYEE_NAME,
  prisma,
  resetE2eDatabase,
  tomorrowInput,
} from './fixtures';

/**
 * 직원(로그인 필수, 사번 진입) 흐름 E2E
 *   사번으로 진입 → 직원 홈 → 본인 방문 신청(동의 카드 없음) / 방문객 대리 신청(동의 확인 체크)
 *   → 내 신청 내역에 구분 표시
 */

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': clientIpFor(`${testInfo.project.name}:${testInfo.title}`),
  });
  await resetE2eDatabase();
  await clearMailOutbox();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function enterAsEmployee(page: import('@playwright/test').Page) {
  await page.goto('/employee/login');
  await page.getByLabel('사번').fill(EMPLOYEE_CODE);
  await page.getByRole('button', { name: '진입하기' }).click();

  await expect(page.getByRole('heading', { name: '시노펙스 방문 예약' })).toBeVisible();
}

test('시드된 사번으로 진입하면 직원 홈으로 이동하고 부서 정보가 보인다', async ({ page }) => {
  await enterAsEmployee(page);

  await expect(
    page.getByText(`${EMPLOYEE_DEPARTMENT_NAME} ${EMPLOYEE_NAME}님, 안녕하세요.`),
  ).toBeVisible();
});

test('등록되지 않은 사번으로는 진입할 수 없다', async ({ page }) => {
  await page.goto('/employee/login');
  await page.getByLabel('사번').fill('NO-SUCH-CODE');
  await page.getByRole('button', { name: '진입하기' }).click();

  await expect(page).toHaveURL(/\/employee\/login/);
  await expect(page.getByText('등록되지 않은 사번입니다.')).toBeVisible();
});

test('비로그인 상태로 /employee 에 접근하면 직원 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/employee');

  await expect(page).toHaveURL(/\/employee\/login/);
  await expect(page.getByRole('heading', { name: '직원 로그인' })).toBeVisible();
});

test('직원 본인 방문 신청은 동의 카드 없이 완료되고 직원 홈으로 돌아갈 수 있다', async ({
  page,
}) => {
  await enterAsEmployee(page);

  await page.goto('/employee/reservations/new');
  await expect(page.getByLabel('성명')).toHaveValue(EMPLOYEE_NAME);
  // 직원 본인 신청은 개인정보 수집·이용 동의 카드 자체가 없다.
  await expect(page.getByText('개인정보 수집 및 이용 동의')).toHaveCount(0);

  await page.getByLabel('차량번호').fill('56다7890');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByRole('button', { name: '방문 신청하기' }).click();

  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await page.getByRole('link', { name: '직원 홈으로' }).click();
  await expect(page.getByRole('heading', { name: '시노펙스 방문 예약' })).toBeVisible();

  const saved = await prisma.parkingReservation.findFirst();
  expect(saved?.requesterType).toBe('EMPLOYEE');
  expect(saved?.employeeUserId).not.toBeNull();
  expect(saved?.visitorUserId).toBeNull();
});

test('직원의 방문객 대리 신청은 방문객 동의 확인 체크가 필요하다', async ({ page }) => {
  await enterAsEmployee(page);

  await page.goto('/employee/reservations/proxy');
  await expect(page.getByText(`담당자: ${EMPLOYEE_NAME}`)).toBeVisible();

  await page.getByLabel('방문상호').fill('외부 협력업체');
  await page.getByLabel('성명').fill('방문객1');
  await page.getByLabel('이메일').fill('visitor1@example.com');
  await page.getByLabel('차량번호').fill('12가3456');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));

  // 동의 확인 체크 없이는 제출 버튼이 비활성 상태다.
  await expect(page.getByRole('button', { name: '방문 신청하기' })).toBeDisabled();

  await page.getByLabel(/방문객으로부터 개인정보 수집·이용 동의를 확인하였습니다/).check();
  await page.getByRole('button', { name: '방문 신청하기' }).click();

  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  const saved = await prisma.parkingReservation.findFirst();
  expect(saved?.requesterType).toBe('VISITOR');
  expect(saved?.employeeUserId).not.toBeNull();
  expect(saved?.visitorUserId).toBeNull();
  expect(saved?.requesterName).toBe('방문객1');
});

test('직원의 내 신청 내역에는 본인 방문과 대리 신청이 구분되어 나온다', async ({ page }) => {
  await enterAsEmployee(page);

  await page.goto('/employee/reservations/new');
  await page.getByLabel('차량번호').fill('56다7890');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByRole('button', { name: '방문 신청하기' }).click();
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await page.goto('/employee/reservations/proxy');
  await page.getByLabel('방문상호').fill('외부 협력업체');
  await page.getByLabel('성명').fill('방문객2');
  await page.getByLabel('이메일').fill('visitor2@example.com');
  await page.getByLabel('차량번호').fill('34나5678');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(14));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(16));
  await page.getByLabel(/방문객으로부터 개인정보 수집·이용 동의를 확인하였습니다/).check();
  await page.getByRole('button', { name: '방문 신청하기' }).click();
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await page.goto('/employee/reservations');
  await expect(page.getByText('내 예약 (2건)')).toBeVisible();
  // 대리 신청 건에만 방문 상호명 태그가 붙고, 본인 방문 건에는 태그가 붙지 않는다.
  await expect(page.getByText('외부 협력업체', { exact: true })).toHaveCount(1);
});

test('내 신청 내역에서 카드를 누르면 예약 상세 조회 화면으로 이동한다', async ({ page }) => {
  await enterAsEmployee(page);

  await page.goto('/employee/reservations/new');
  await page.getByLabel('차량번호').fill('56다7890');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await page.getByRole('button', { name: '방문 신청하기' }).click();
  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  const reservationNo = await page.getByTestId('reservation-no').innerText();

  await page.goto('/employee/reservations');
  await page.getByText(reservationNo).click();

  await expect(page).toHaveURL(/\/r\//);
  await expect(page.getByRole('heading', { name: '내 예약' })).toBeVisible();
  await expect(page.getByText(EMPLOYEE_NAME)).toBeVisible();
});

test('내 신청 내역에서 차량번호를 수정할 수 있다', async ({ page }) => {
  await enterAsEmployee(page);

  await page.goto('/employee/reservations');
  await page.getByLabel('차량번호').fill('78마1234');
  await page.getByRole('button', { name: '내 정보 저장' }).click();

  await expect(page.getByText('내 정보를 저장했습니다.')).toBeVisible();

  await page.goto('/employee/reservations/new');
  await expect(page.getByLabel('차량번호')).toHaveValue('78마1234');
});
