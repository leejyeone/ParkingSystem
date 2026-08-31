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

/**
 * 감사 로그(접속기록) 보관 기간(일). 기본 365일.
 *
 * 「개인정보의 안전성 확보조치 기준」 제8조상 최소 1년이므로, 더 짧은 값이 들어오면
 * 값은 그대로 쓰되 경고를 남긴다. (운영자가 의도적으로 낮춘 것인지 드러나야 한다)
 */
export function getAuditLogRetentionDays(): number {
  const days = getNumberEnv('AUDIT_LOG_RETENTION_DAYS', 365);
  if (days < 365) {
    console.warn(
      `[WARN] AUDIT_LOG_RETENTION_DAYS=${days} 는 법정 최소 보관 기간(365일)보다 짧습니다.`,
    );
  }
  return days;
}

/** cron 엔드포인트 인증용 비밀값 */
export function getCronSecret(): string {
  return getRequiredEnv('CRON_SECRET');
}

/**
 * 앱 내장 스케줄러 사용 여부. 기본 활성화.
 *
 * 플랫폼 cron 으로 /api/cron/* 을 직접 호출하는 환경에서는 false 로 꺼서
 * 같은 작업이 두 경로로 실행되지 않게 한다.
 */
export function isInternalSchedulerEnabled(): boolean {
  return (getOptionalEnv('INTERNAL_SCHEDULER_ENABLED') ?? 'true').toLowerCase() !== 'false';
}

/**
 * 내장 스케줄러 실행 주기(초). 기본 60초.
 *
 * 출차 알림은 "몇 분 전"이 기준이므로 분 단위보다 촘촘할 필요가 없다.
 * 너무 짧으면 빈 조회만 반복되므로 최소 10초로 제한한다.
 */
export function getSchedulerIntervalSeconds(): number {
  return Math.max(10, getNumberEnv('SCHEDULER_INTERVAL_SECONDS', 60));
}

export type EmailProviderKind = 'gmail' | 'smtp' | 'mock' | 'log' | 'file';

export function getEmailProviderKind(): EmailProviderKind {
  const value = (getOptionalEnv('EMAIL_PROVIDER') ?? 'log').toLowerCase();
  if (
    value === 'gmail' ||
    value === 'smtp' ||
    value === 'mock' ||
    value === 'log' ||
    value === 'file'
  ) {
    return value;
  }
  return 'log';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
