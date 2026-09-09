import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { siteUserBulkStatusSchema } from '@/lib/validation/user-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { bulkUpdateSiteUserStatus } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/site-users/bulk-status — 선택한 회원 계정을 한 번에 활성화/비활성화한다.
 * 시스템 관리자 전용.
 */
export async function POST(request: NextRequest) {
  try {
    await requireActiveSystemAdmin();
    const payload = siteUserBulkStatusSchema.parse(await readJsonBody(request));

    const result = await bulkUpdateSiteUserStatus({
      userIds: payload.userIds,
      accountStatus: payload.accountStatus,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
