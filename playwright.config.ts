import os from 'node:os';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// E2E 는 통합 테스트와 동일한 테스트 DB 를 사용한다.
loadEnv({ path: '.env.test', override: false });

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

// 메일 아웃박스는 프로젝트 밖에 둔다. 프로젝트 안에서 파일을 만들고 지우면
// dev 서버 파일 감시가 재컴파일을 일으켜 테스트 중 화면이 다시 그려질 수 있다.
// (여기서 process.env 에 넣어 두면 워커 프로세스와 webServer 가 같은 값을 사용한다)
process.env.MAIL_OUTBOX_DIR ??= path.join(os.tmpdir(), 'parking-e2e-mail-outbox');

export default defineConfig({
  testDir: './tests/e2e',
  // 동일 DB 를 공유하므로 순차 실행한다.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // 모바일 우선 반응형 확인용
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // 실제 메일을 보내지 않고 파일로 저장한다. (예약 조회 링크 추출용)
      EMAIL_PROVIDER: 'file',
      MAIL_OUTBOX_DIR: process.env.MAIL_OUTBOX_DIR,
      APP_BASE_URL: BASE_URL,
      APP_TIME_ZONE: 'Asia/Seoul',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'e2e-session-secret-0123456789abcdef',
      RESERVATION_TOKEN_SECRET:
        process.env.RESERVATION_TOKEN_SECRET ?? 'e2e-token-secret-0123456789abcdef',
      CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret',
    },
  },
});
