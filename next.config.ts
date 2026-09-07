import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * 빌드 산출물 경로.
   *
   * 기본은 .next 이지만, E2E 는 NEXT_DIST_DIR=.next-e2e 로 분리해서 사용한다.
   * 개발자가 `npm run dev` 를 띄워 둔 상태에서도 E2E 가 산출물을 덮어쓰지 않도록 하기 위해서다.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',

  /**
   * 개발 중 실기기(휴대폰) 확인을 위해 접속을 허용할 호스트.
   *
   * Next 는 이 목록에 없는 호스트에서 온 요청에 대해 dev 내부 리소스(HMR 웹소켓 등)를
   * 403 으로 막는다. 로컬 dev 서버를 Cloudflare 임시 터널로 노출해 폰에서 볼 때 필요하다.
   * 터널 주소는 실행할 때마다 바뀌므로 서브도메인 와일드카드로 둔다.
   *
   * 개발 전용 설정이라 운영 빌드에는 영향이 없다.
   */
  allowedDevOrigins: ['*.trycloudflare.com'],

  /**
   * 승인 메일의 주차 평면도 이미지를 만드는 데 쓰는 @resvg/resvg-js 는 네이티브
   * 바인딩(napi)을 로드하는 패키지라 번들러(Turbopack)가 정적으로 분석할 수 없다
   * ("non-ecmascript placeable asset" 빌드 에러). 서버 번들에서 제외하고 런타임에
   * Node 의 require 로 그대로 불러오도록 한다.
   */
  serverExternalPackages: ['@resvg/resvg-js'],
};

export default nextConfig;
