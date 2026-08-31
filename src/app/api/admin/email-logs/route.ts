import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { emailLogQuerySchema } from '@/lib/validation/admin-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { listEmailLogs } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/email-logs — 시스템 관리자 전용.
 * Gmail API 발송 실패 사유(fail_reason)를 이 목록에서 확인한다.
 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveSystemAdmin();
    const query = emailLogQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const result = await listEmailLogs(query);
    return apiSuccess(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
