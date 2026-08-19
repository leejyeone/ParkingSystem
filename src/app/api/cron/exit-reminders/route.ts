import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { assertCronAuthorized } from '@/lib/cron-auth';
import { runExitReminderJob } from '@/services/exit-reminder-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/exit-reminders
 *
 * 출차 예정 시간 EXIT_REMINDER_MINUTES 분 전인 예약에 알림 메일을 발송한다.
 *
 * 보안: Authorization: Bearer <CRON_SECRET> 헤더를 검증한다.
 * 멱등성: email_send_logs.dedupe_key UNIQUE 제약으로 중복 발송을 차단하므로
 *         1분 간격으로 중복 실행되어도 같은 예약에 두 번 발송되지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await runExitReminderJob();
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** 플랫폼 스케줄러(Vercel Cron 등)가 GET 으로 호출하는 경우를 위한 별칭 */
export async function GET(request: NextRequest) {
  return POST(request);
}
