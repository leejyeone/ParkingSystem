/**
 * 개인정보 비노출 로거.
 *
 * 서버 콘솔 로그에 이메일, 휴대전화, 차량번호, 토큰이 평문으로 남지 않도록
 * 출력 직전에 문자열을 치환한다. 클라이언트에서는 사용하지 않는다.
 */

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_PATTERN = /\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g;
const VEHICLE_PATTERN = /\b(?:[가-힣]{2})?\d{2,3}[가-힣]\s?\d{4}\b/g;
const TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(EMAIL_PATTERN, '[email]')
      .replace(PHONE_PATTERN, '[phone]')
      .replace(VEHICLE_PATTERN, '[vehicle]')
      .replace(TOKEN_PATTERN, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (/(email|phone|vehicle|token|password|secret|name)/i.test(key)) {
        result[key] = '[redacted]';
      } else {
        result[key] = redact(item);
      }
    }
    return result;
  }
  return value;
}

function write(level: 'info' | 'warn' | 'error', message: string, context?: unknown): void {
  const payload = context === undefined ? '' : ` ${JSON.stringify(redact(context))}`;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${String(redact(message))}${payload}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (message: string, context?: unknown) => write('info', message, context),
  warn: (message: string, context?: unknown) => write('warn', message, context),
  error: (message: string, context?: unknown) => write('error', message, context),
};
