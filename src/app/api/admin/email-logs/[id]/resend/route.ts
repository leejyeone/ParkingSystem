import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { resendFailedEmail } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/email-logs/[id]/resend — 발송 실패 건을 원문 그대로 재발송한다.
 * 시스템 관리자 전용.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveSystemAdmin();
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
