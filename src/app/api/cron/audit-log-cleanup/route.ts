import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { assertCronAuthorized } from '@/lib/cron-auth';
import { getAuditLogRetentionDays } from '@/lib/env';
import { purgeExpiredAuditLogs } from '@/services/audit-retention-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/audit-log-cleanup
 *
 * 보관 기간(AUDIT_LOG_RETENTION_DAYS, 기본 365일)이 지난 감사 로그를 삭제한다.
 * 하루 1회 정도로 충분하며, 중복 실행되어도 안전하다(이미 지워진 행은 대상이 아님).
 *
 * 보안: Authorization: Bearer <CRON_SECRET> 헤더를 검증한다.
 */
export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await purgeExpiredAuditLogs(new Date(), getAuditLogRetentionDays());
    return apiSuccess({
      deletedCount: result.deletedCount,
      cutoff: result.cutoff.toISOString(),
      hasMore: result.truncated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** 플랫폼 스케줄러(Vercel Cron 등)가 GET 으로 호출하는 경우를 위한 별칭 */
export async function GET(request: NextRequest) {
  return POST(request);
}
