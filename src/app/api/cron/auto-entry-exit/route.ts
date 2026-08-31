import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { assertCronAuthorized } from '@/lib/cron-auth';
import { runAutoEntryExitJob } from '@/services/exit-reminder-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/auto-entry-exit
 *
 * "입출차 자동 처리"를 켠 반복 예약 occurrence 를 예정 시각에 맞춰 자동으로
 * 입차/출차 처리한다. 입·출차 관리 시스템 설정이 꺼져 있으면 아무 것도 하지 않는다.
 *
 * 보안: Authorization: Bearer <CRON_SECRET> 헤더를 검증한다.
 * 멱등성: actualEntryAt/actualExitAt 이 이미 채워진 예약은 대상에서 빠지므로
 *         1분 간격으로 중복 실행되어도 같은 예약이 두 번 처리되지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await runAutoEntryExitJob();
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** 플랫폼 스케줄러(Vercel Cron 등)가 GET 으로 호출하는 경우를 위한 별칭 */
export async function GET(request: NextRequest) {
  return POST(request);
}
