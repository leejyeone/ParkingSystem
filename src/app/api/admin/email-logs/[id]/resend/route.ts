import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { resendFailedEmail } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/email-logs/[id]/resend — 발송 실패 건을 원문 그대로 재발송한다.
 * 발송 실패는 방문객이 승인/조회 메일을 못 받는 일상 운영 이슈라, 주차 관리자도
 * 조회·재발송할 수 있어야 한다(시스템 관리자 전용이 아니다).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const emailLogId = parseNumericId(id, '이메일 로그 ID');

    const updated = await resendFailedEmail(emailLogId, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ emailLogId: updated.emailLogId, sendStatus: updated.sendStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
