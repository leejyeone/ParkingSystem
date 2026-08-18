import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getReservationTokenSecret } from '@/lib/env';

/**
 * 예약 조회용 보안 토큰.
 *
 * - 원본 토큰은 이메일 링크에만 존재하며 DB 에 저장하지 않는다.
 * - DB 에는 HMAC-SHA256(RESERVATION_TOKEN_SECRET, 원본) hex 값만 저장한다.
 * - 단순 SHA-256 대신 HMAC 을 쓰는 이유: DB 가 유출되어도 서버 비밀키 없이는
 *   레인보우 테이블/오프라인 대입으로 원본 토큰을 역산할 수 없다.
 */

/** URL 안전한 랜덤 토큰(기본 32바이트 = 256bit) 생성 */
export function generateAccessToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/** 원본 토큰의 HMAC-SHA256 hex 해시 */
export function hashAccessToken(rawToken: string, secret = getReservationTokenSecret()): string {
  return createHmac('sha256', secret).update(rawToken, 'utf8').digest('hex');
}

/** 타이밍 공격에 안전한 해시 비교 */
export function safeCompareHash(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** 이메일에 삽입할 예약 조회 링크 */
export function buildReservationAccessUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/r/${encodeURIComponent(rawToken)}`;
}

/**
 * 예약번호 생성: PK-YYYYMMDD-XXXXXX
 * 예약번호는 식별자일 뿐이며, 이 값만으로는 예약을 조회할 수 없다.
 */
const RESERVATION_NO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자(I,O,0,1) 제외

export function generateReservationNo(dateString: string): string {
  const bytes = randomBytes(6);
  let suffix = '';
  for (const byte of bytes) {
    suffix += RESERVATION_NO_ALPHABET[byte % RESERVATION_NO_ALPHABET.length];
  }
  return `PK-${dateString.replace(/-/g, '')}-${suffix}`;
}
