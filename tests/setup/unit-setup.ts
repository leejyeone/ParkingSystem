/**
 * 단위 테스트 공통 설정.
 * DB 나 외부 서비스에 의존하지 않으며, 환경변수만 결정적으로 고정한다.
 */
process.env.APP_TIME_ZONE = 'Asia/Seoul';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'unit-test-session-secret-0123456789abcdef';
process.env.RESERVATION_TOKEN_SECRET = 'unit-test-token-secret-0123456789abcdef';
process.env.CRON_SECRET = 'unit-test-cron-secret';
process.env.EMAIL_PROVIDER = 'mock';
