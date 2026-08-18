/**
 * 환경변수 접근 유틸리티.
 *
 * - 모든 접근은 함수 호출 시점에 평가한다(지연 평가). 모듈 로드 시점에 필수 값을
 *   강제하면 테스트나 일부 스크립트 실행이 불가능해지기 때문이다.
 * - 비밀값은 서버에서만 읽는다. NEXT_PUBLIC_ 접두사를 절대 붙이지 않는다.
 */

export function getOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`필수 환경변수 ${name} 이(가) 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

export function getNumberEnv(name: string, fallback: number): number {
  const value = getOptionalEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 화면/이메일 표시 기준 타임존 */
export function getAppTimeZone(): string {
  return getOptionalEnv('APP_TIME_ZONE') ?? 'Asia/Seoul';
}

/** 이메일 링크 생성 기준 URL (끝 슬래시 제거) */
export function getAppBaseUrl(): string {
  const base = getOptionalEnv('APP_BASE_URL') ?? 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

/** 관리자 세션 서명 키 */
export function getSessionSecret(): string {
  return getRequiredEnv('NEXTAUTH_SECRET');
}

/** 예약 접근 토큰 HMAC 키 */
export function getReservationTokenSecret(): string {
  return getRequiredEnv('RESERVATION_TOKEN_SECRET');
}

/** 관리자 세션 유효시간(분) */
export function getSessionMaxAgeMinutes(): number {
  return getNumberEnv('SESSION_MAX_AGE_MINUTES', 480);
}

/** cron 엔드포인트 인증용 비밀값 */
export function getCronSecret(): string {
  return getRequiredEnv('CRON_SECRET');
}

export type EmailProviderKind = 'gmail' | 'mock' | 'log' | 'file';

export function getEmailProviderKind(): EmailProviderKind {
  const value = (getOptionalEnv('EMAIL_PROVIDER') ?? 'log').toLowerCase();
  if (value === 'gmail' || value === 'mock' || value === 'log' || value === 'file') return value;
  return 'log';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
