import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { siteUserUpdateStatusSchema } from '@/lib/validation/user-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { updateSiteUserStatus } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/site-users/[id] — 회원 계정 활성·비활성 전환. 시스템 관리자 전용. */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveSystemAdmin();
    const { id } = await context.params;
    const payload = siteUserUpdateStatusSchema.parse(await readJsonBody(request));

    const updated = await updateSiteUserStatus(
      parseNumericId(id, '회원 계정 ID'),
      payload.accountStatus,
    );

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
