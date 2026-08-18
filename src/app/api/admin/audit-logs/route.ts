import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { auditLogQuerySchema } from '@/lib/validation/admin-schema';
import { requireSystemAdmin } from '@/services/admin-auth-service';
import { listAuditLogs } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/audit-logs — 감사 로그 조회 (SYSTEM_ADMIN 전용) */
export async function GET(request: NextRequest) {
  try {
    await requireSystemAdmin();
    const query = auditLogQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const result = await listAuditLogs(query);
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
