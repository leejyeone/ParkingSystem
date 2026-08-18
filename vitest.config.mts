import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 테스트 구성
 *
 *  - unit        : DB 없이 실행되는 순수 로직 테스트 (기본 `npm test` 대상)
 *  - ui          : React 컴포넌트 테스트 (jsdom + Testing Library)
 *  - integration : 실제 MySQL 테스트 DB 를 사용하는 통합 테스트
 *                  (.env.test 필요, `npm run test:integration`)
 */
export default defineConfig({
  plugins: [react()],
  // tsconfig 의 "@/*" 경로 별칭을 그대로 사용한다.
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup/unit-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.tsx'],
          setupFiles: ['tests/setup/ui-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/integration-setup.ts'],
          // 통합 테스트는 동일 DB 를 공유하므로 파일 간 순차 실행한다.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/domain/**', 'src/services/**'],
      exclude: ['src/lib/client/**'],
    },
  },
});
