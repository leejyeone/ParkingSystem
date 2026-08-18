import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * 빌드 산출물 경로.
   *
   * 기본은 .next 이지만, E2E 는 NEXT_DIST_DIR=.next-e2e 로 분리해서 사용한다.
   * 개발자가 `npm run dev` 를 띄워 둔 상태에서도 E2E 가 산출물을 덮어쓰지 않도록 하기 위해서다.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
