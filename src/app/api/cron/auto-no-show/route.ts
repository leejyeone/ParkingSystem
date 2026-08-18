import { timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getCronSecret } from '@/lib/env';
import { UnauthorizedError } from '@/lib/errors';
import { runAutoNoShowJob } from '@/services/exit-reminder-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/auto-no-show (선택 기능)
 *
 * 예약 종료 후에도 입차 기록이 없는 APPROVED 예약을 NO_SHOW 로 자동 전환한다.
 * MVP 에서는 스케줄에 등록하지 않는 것을 기본으로 하며, 필요 시 cron 에 추가한다.
 */
export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const graceMinutes = Number(request.nextUrl.searchParams.get('graceMinutes') ?? '30');
    const result = await runAutoNoShowJob(
      new Date(),
      Number.isFinite(graceMinutes) ? graceMinutes : 30,
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

function assertCronAuthorized(request: NextRequest): void {
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
