import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { adminChangePasswordSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { changeOwnAdminPassword } from '@/services/admin-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /api/admin/auth/password — 본인 비밀번호 변경 (다른 관리자의 비밀번호는 바꿀 수 없다) */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();
    const payload = adminChangePasswordSchema.parse(await readJsonBody(request));

    await changeOwnAdminPassword(session.adminUserId, payload, {
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ changed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
