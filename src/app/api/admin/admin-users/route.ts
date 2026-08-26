import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { adminUserCreateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { createAdminUser, listAdminUsers } from '@/services/admin-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/admin-users — 관리자 계정 목록 */
export async function GET() {
  try {
    await requireActiveAdmin();
    return apiSuccess(await listAdminUsers());
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/admin-users — 관리자 계정 생성 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();
    const payload = adminUserCreateSchema.parse(await readJsonBody(request));

    const created = await createAdminUser(payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(created, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
