import { timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { getCronSecret } from '@/lib/env';
import { UnauthorizedError } from '@/lib/errors';

/**
 * 스케줄러(cron) 엔드포인트 인증.
 *
 * Authorization: Bearer <CRON_SECRET> 또는 X-Cron-Secret 헤더로 검증한다.
 * 길이 비교 후 timingSafeEqual 을 사용해 타이밍 공격을 막는다.
 */
export function assertCronAuthorized(request: NextRequest): void {
  const expected = getCronSecret();
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : (request.headers.get('x-cron-secret') ?? '').trim();

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new UnauthorizedError('스케줄러 인증에 실패했습니다.');
  }
}
