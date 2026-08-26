import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { assertCronAuthorized } from '@/lib/cron-auth';
import { runEntryReminderJob } from '@/services/entry-reminder-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/entry-reminders
 *
 * 입차 예정 시각 ENTRY_REMINDER_MINUTES(10)분 전인 방문객 예약에 대해, 매핑된 당사 담당자에게
 * 안내 메일을 발송한다.
 *
 * 보안: Authorization: Bearer <CRON_SECRET> 헤더를 검증한다.
 * 멱등성: email_send_logs.dedupe_key UNIQUE 제약으로 중복 발송을 차단하므로
 *         짧은 간격으로 중복 실행되어도 같은 예약에 두 번 발송되지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await runEntryReminderJob();
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** 플랫폼 스케줄러(Vercel Cron 등)가 GET 으로 호출하는 경우를 위한 별칭 */
export async function GET(request: NextRequest) {
  return POST(request);
}
