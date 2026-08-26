import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { adminUserUpdateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { deleteAdminUser, updateAdminUser } from '@/services/admin-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/admin-users/[id] — 관리자 계정 수정/비활성화 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
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

/**
 * DELETE /api/admin/admin-users/[id] — 관리자 계정 삭제
 *
 * 감사 로그·승인 이력이 이 계정을 참조하므로 행을 지우지 않고 deleted_at 만 채운다.
 * 본인 계정이거나 마지막 남은 활성 시스템 관리자면 409 로 거부된다.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;

    const result = await deleteAdminUser(parseNumericId(id, '관리자 ID'), {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
