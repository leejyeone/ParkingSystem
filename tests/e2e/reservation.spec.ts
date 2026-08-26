import { expect, test } from '@playwright/test';

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  clearMailOutbox,
  clientIpFor,
  prisma,
  resetE2eDatabase,
  selectHostEmployee,
  tomorrowInput,
  waitForAccessUrl,
} from './fixtures';

/**
 * 사용자 흐름 E2E
 *   방문객 예약 신청 → 이메일 링크로 조회·수정 → 관리자 로그인 → 승인 및 주차면 배정
 *   → 승인 후에는 신청자 수정 불가, 관리자만 수정
 *
 * 이메일은 FileEmailProvider(.mail-outbox)로 대체한다.
 */

const REQUESTER_EMAIL = 'e2e-visitor@example.com';

test.beforeEach(async ({ page }, testInfo) => {
  // 테스트마다 다른 IP 로 접속해 레이트 리밋 버킷을 분리한다. (fixtures 주석 참고)
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': clientIpFor(`${testInfo.project.name}:${testInfo.title}`),
  });
  await resetE2eDatabase();
  await clearMailOutbox();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function submitReservation(
  page: import('@playwright/test').Page,
  overrides: { requesterName?: string; vehicleNo?: string; requesterEmail?: string } = {},
) {
  await page.goto('/reservations/new');

  await page.getByLabel('방문상호').fill('시노펙스');
  await page.getByLabel('성명').fill(overrides.requesterName ?? '홍길동');
  await page.getByLabel('이메일').fill(overrides.requesterEmail ?? REQUESTER_EMAIL);
  await page.getByLabel('차량번호').fill(overrides.vehicleNo ?? '12가 3456');
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(10));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(12));
  await selectHostEmployee(page);
  await page.getByLabel(/개인정보 수집 및 이용에 동의합니다/).check();

  await page.getByRole('button', { name: '방문 신청하기' }).click();
}

/** 이미 로그인되어 있으면 로그인 화면이 대시보드로 리다이렉트되므로 그대로 진행한다. */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');

  const emailField = page.getByLabel('이메일');
  if ((await emailField.count()) > 0) {
    await emailField.fill(ADMIN_EMAIL);
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
  // 목록의 예약번호는 링크가 아니므로 행을 눌러 상세에 진입한다.
  await page.getByTestId('reservation-row').first().click();
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

test('예약 조회 화면에서 성명·차량번호 입력과 메일 링크 안내를 모두 제공한다', async ({ page }) => {
  await page.goto('/reservations/lookup');

  await expect(page.locator('input[name="requesterName"]')).toBeVisible();
  await expect(page.locator('input[name="vehicleNo"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '예약 검색하기' })).toBeVisible();
  await expect(page.getByText('검색이 안 되시나요?')).toBeVisible();
});

test('성명·차량번호로 검색하면 일치하는 예약 목록이 보이고 행을 누르면 상세로 이동한다', async ({
  page,
}) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await page.goto('/reservations/lookup');
  await page.locator('input[name="requesterName"]').fill('홍길동');
  await page.locator('input[name="vehicleNo"]').fill('12가3456');
  await page.getByRole('button', { name: '예약 검색하기' }).click();

  // 목록에는 예약번호 대신 방문 일정이 보이고, 행 자체가 상세로 가는 버튼이다.
  await expect(page.getByText('검색 결과')).toBeVisible();
  await page.getByRole('button', { name: /자세히 보기/ }).click();

  await expect(page.getByRole('heading', { name: '내 예약' })).toBeVisible();
});

test('예약 목록의 검색 조건은 기본으로 접혀 있고 적용된 조건만 칩으로 보인다', async ({ page }) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  await loginAsAdmin(page);

  // 조건 없이 들어가면 입력 폼이 보이지 않는다.
  await page.goto('/admin/reservations');
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
  await expect(page.getByLabel('차량번호')).toBeHidden();
  await expect(page.getByText('전체 예약을 보고 있습니다.')).toBeVisible();

  // 버튼을 눌러야 입력 폼이 펼쳐진다.
  await page.getByTestId('filter-toggle').click();
  await expect(page.getByLabel('차량번호')).toBeVisible();

  // 조건을 적용하면 폼은 다시 접히고 칩으로만 표시된다.
  await page.getByLabel('예약 상태').selectOption('REQUESTED');
  // '검색 조건' 토글 버튼과 구분하기 위해 정확히 일치하는 이름으로 찾는다.
  await page.getByRole('button', { name: '검색', exact: true }).click();

  await expect(page.getByLabel('차량번호')).toBeHidden();
  await expect(page.getByRole('link', { name: /상태.*승인 대기/ })).toBeVisible();

  // 칩을 누르면 그 조건만 해제된다.
  await page.getByRole('link', { name: /상태.*승인 대기/ }).click();
  await expect(page).toHaveURL(/\/admin\/reservations$/);
  await expect(page.getByText('전체 예약을 보고 있습니다.')).toBeVisible();
});

test('예약 목록에서 행을 누르면 상세 화면으로 이동한다', async ({ page }) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  await loginAsAdmin(page);

  await page.goto('/admin/reservations');
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();

  // 링크가 아닌 셀(성명)을 눌러도 상세로 이동해야 한다.
  await page.getByTestId('reservation-row').first().getByText('홍길동').click();

  await expect(page.getByRole('heading', { name: /^PK-/ })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/reservations\/\d+$/);
});

test('관리자가 로그인해 예약을 승인하고 주차면을 배정한다', async ({ page }) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await loginAsAdmin(page);
  await openPendingReservationDetail(page);

  // 배정할 주차면 드롭다운에 기본값(A-01)이 이미 선택되어 있다.
  await expect(page.getByLabel('배정할 주차면')).toHaveValue(/\d+/);
  await expect(page.getByLabel('배정할 주차면').locator('option:checked')).toContainText('A-01');

  await page.getByRole('button', { name: '승인 및 위치 확정' }).click();

  // 승인이 끝나면 승인 대기 목록으로 돌아간다. 방금 승인한 건은 더 이상 승인 대기가 아니므로
  // 이 필터에는 나오지 않고, 완료 안내만 뜬다.
  await expect(page).toHaveURL(/\/admin\/reservations\?status=REQUESTED&approved=PK-/);
  await expect(page.getByText('승인 처리를 완료했습니다')).toBeVisible();
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();
  await expect(page.getByText('조건에 해당하는 예약이 없습니다.')).toBeVisible();

  const reservation = await prisma.parkingReservation.findFirst({
    include: { assignedSpace: true },
  });
  expect(reservation?.reservationStatus).toBe('APPROVED');
  expect(reservation?.assignedSpace?.spaceCode).toBe('A-01');
});

/**
 * 수정 권한 정책 전체 흐름.
 *
 * 신청자는 승인 대기 상태에서만 스스로 고칠 수 있고, 승인된 뒤에는 관리자만 고칠 수 있다.
 * (REQUESTER_MODIFIABLE_STATUSES = ['REQUESTED'])
 */
test('신청자는 승인 대기 상태에서만 수정할 수 있고, 승인 후에는 관리자가 수정한다', async ({
  page,
}) => {
  await submitReservation(page);
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  // 1) 승인 대기 상태에서는 신청자가 이메일 링크로 직접 수정할 수 있다.
  const accessUrl = await waitForAccessUrl(REQUESTER_EMAIL);
  await page.goto(accessUrl);

  await expect(page.getByRole('heading', { name: '내 예약' })).toBeVisible();
  await expect(page.getByText('승인 대기')).toBeVisible();

  await page.getByRole('button', { name: '예약 수정하기' }).click();
  await page.getByLabel('입차 예정 시간').fill(tomorrowInput(14));
  await page.getByLabel('출차 예정 시간').fill(tomorrowInput(16));
  await page.getByRole('button', { name: '수정 내용 저장' }).click();

  await expect(page.getByText(/변경된 예약은 다시 관리자 승인/)).toBeVisible();

  const afterRequesterEdit = await prisma.parkingReservation.findFirst();
  expect(afterRequesterEdit?.reservationStatus).toBe('REQUESTED');

  // 2) 관리자가 승인한다.
  await loginAsAdmin(page);
  await openPendingReservationDetail(page);
  const detailUrl = page.url();
  await page.getByRole('button', { name: '승인 및 위치 확정' }).click();
  await expect(page.getByText('승인 처리를 완료했습니다')).toBeVisible();

  // 3) 승인 후에는 신청자에게 수정 버튼이 없고 담당자 문의 안내만 보인다.
  await page.goto(accessUrl);
  // '승인 완료' 는 상태 배지와 차단 사유 문구 양쪽에 나오므로 정확히 일치하는 쪽만 고른다.
  await expect(page.getByText('승인 완료', { exact: true })).toBeVisible();
  await expect(page.getByText('수정·취소할 수 없습니다')).toBeVisible();
  await expect(page.getByText(/담당자에게 문의해 주세요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '예약 수정하기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예약 취소하기' })).toHaveCount(0);

  // 4) 대신 관리자가 상세 화면의 [일정 및 주차 위치] 카드에서 시간을 고친다.
  await page.goto(detailUrl);
  const scheduleCard = page.locator('section.card', { hasText: '일정 및 주차 위치' }).first();
  await scheduleCard.getByRole('button', { name: '수정하기' }).click();

  await page.getByLabel('입차 예정').fill(tomorrowInput(15));
  await page.getByLabel('출차 예정').fill(tomorrowInput(17));
  await scheduleCard.getByRole('button', { name: '저장' }).click();

  // 저장이 끝나면 편집이 닫히고 [수정하기] 버튼이 다시 나타난다.
  await expect(scheduleCard.getByRole('button', { name: '수정하기' })).toBeVisible();

  // 관리자 수정은 상태를 유지한다. (승인 완료 → 승인 완료)
  const afterAdminEdit = await prisma.parkingReservation.findFirst();
  expect(afterAdminEdit?.reservationStatus).toBe('APPROVED');
  expect(afterAdminEdit?.assignedSpaceId).not.toBeNull();
  expect(afterAdminEdit?.visitStartAt.toISOString()).toBe(
    // KST 15:00 = UTC 06:00
    `${tomorrowInput(15).slice(0, 11)}06:00:00.000Z`,
  );
});

test('일괄 반려 화면에서 체크박스를 직접 클릭해도 선택이 유지된다', async ({ page }) => {
  await submitReservation(page, { requesterName: '홍길동', vehicleNo: '12가3456' });
  await expect(page.getByTestId('reservation-complete')).toBeVisible();
  await submitReservation(page, {
    requesterName: '김철수',
    vehicleNo: '34나5678',
    requesterEmail: 'e2e-visitor2@example.com',
  });
  await expect(page.getByTestId('reservation-complete')).toBeVisible();

  await loginAsAdmin(page);
  await page.goto('/admin/reservations?status=REQUESTED');
  await expect(page.getByRole('heading', { name: '예약 목록' })).toBeVisible();

  await page.getByRole('button', { name: '일괄 반려' }).click();

  const hongRow = page.getByTestId('reservation-row').filter({ hasText: '홍길동' });
  const hongCheckbox = hongRow.getByRole('checkbox');

  // 체크박스를 직접 클릭했을 때, 그 클릭이 행의 onClick 으로도 다시 전달되어
  // 두 번 토글되면서 선택이 즉시 풀리는 버그가 없어야 한다.
  await hongCheckbox.click();
  await expect(hongCheckbox).toBeChecked();
  await expect(page.getByText('1건 선택됨')).toBeVisible();

  await hongCheckbox.click();
  await expect(hongCheckbox).not.toBeChecked();
  await expect(page.getByText('0건 선택됨')).toBeVisible();

  // 체크박스가 아닌 행의 다른 부분을 클릭해도 선택은 그대로 동작해야 한다.
  await hongRow.locator('td').nth(1).click();
  await expect(hongCheckbox).toBeChecked();

  await page.getByPlaceholder('선택한 예약 전체에 공통으로 적용할 반려 사유').fill('현장 사정');
  await page.getByRole('button', { name: /선택한 1건 반려하기/ }).click();

  await expect(page.getByText('1건 반려 완료.')).toBeVisible();

  const rejected = await prisma.parkingReservation.findFirst({
    where: { requesterName: '홍길동' },
  });
  expect(rejected?.reservationStatus).toBe('REJECTED');
  const other = await prisma.parkingReservation.findFirst({ where: { requesterName: '김철수' } });
  expect(other?.reservationStatus).toBe('REQUESTED');
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
