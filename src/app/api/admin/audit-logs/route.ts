import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { auditLogQuerySchema } from '@/lib/validation/admin-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGETS,
  VIEW_AUDIT_ACTIONS,
  writeAuditLog,
} from '@/services/audit-service';
import { listAuditLogs } from '@/services/log-query-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/audit-logs — 감사 로그 조회 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireActiveSystemAdmin();
    const query = auditLogQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    // 감사 기록을 누가 열어봤는지도 추적 대상이다.
    await writeAuditLog({
      actorAdminId: session.adminUserId,
      actionType: AUDIT_ACTIONS.AUDIT_LOG_VIEW,
      targetType: AUDIT_TARGETS.AUDIT_LOG,
      targetId: null,
      detail: {
        actionTypeFilter: query.actionType ?? null,
        includeViews: query.includeViews === '1',
        page: query.page,
      },
      context: getRequestContext(request.headers),
    });

    // 화면과 동일하게 개인정보 열람 기록은 기본 제외한다. includeViews=1 로 포함할 수 있다.
    const { includeViews, ...filter } = query;
    const result = await listAuditLogs({
      ...filter,
      excludeActionTypes: includeViews === '1' ? undefined : VIEW_AUDIT_ACTIONS,
    });
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
