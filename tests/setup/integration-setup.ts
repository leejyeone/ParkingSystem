import { config } from 'dotenv';

/**
 * 통합 테스트 공통 설정.
 *
 * .env.test 를 먼저 로드해 반드시 별도의 테스트 DB 를 사용하도록 한다.
 * (통합 테스트는 테이블을 TRUNCATE 하므로 개발/운영 DB 를 절대 사용하면 안 된다)
 */
config({ path: '.env.test', override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    '통합 테스트에는 .env.test 의 DATABASE_URL 이 필요합니다. .env.test.example 을 복사해 설정하세요.',
  );
}

if (!/test/i.test(process.env.DATABASE_URL)) {
  throw new Error(
    `안전장치: 통합 테스트용 DATABASE_URL 에는 "test" 가 포함되어야 합니다. 현재 값의 DB 이름을 확인하세요.`,
  );
}

process.env.EMAIL_PROVIDER = 'mock';
process.env.APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? 'Asia/Seoul';
