import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { emailLogQuerySchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listEmailLogs } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/email-logs — 화면(`/admin/email-logs`)은 서버 컴포넌트가 직접 조회해서
 * 렌더링하므로 이 라우트는 현재 프런트에서 호출하지 않지만, 같은 데이터를 다루는
 * 화면·재발송 API(`[id]/resend`)가 모두 역할 무관 접근이라 권한 수준을 맞춰 둔다.
 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();
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
