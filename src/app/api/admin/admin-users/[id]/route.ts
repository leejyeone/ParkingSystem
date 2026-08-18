import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { adminUserUpdateSchema } from '@/lib/validation/admin-schema';
import { requireSystemAdmin } from '@/services/admin-auth-service';
import { updateAdminUser } from '@/services/admin-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/admin-users/[id] — 관리자 계정 수정/비활성화 (SYSTEM_ADMIN 전용) */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSystemAdmin();
    const { id } = await context.params;
    const payload = adminUserUpdateSchema.parse(await readJsonBody(request));

    const updated = await updateAdminUser(parseNumericId(id, '관리자 ID'), payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
