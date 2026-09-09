import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { resetSiteUserPassword } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/site-users/[id]/reset-password — 회원 비밀번호를 고정 비밀번호
 * (`SITE_USER_RESET_PASSWORD`)로 초기화한다. 시스템 관리자 전용.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveSystemAdmin();
    const { id } = await context.params;

    const result = await resetSiteUserPassword(parseNumericId(id, '회원 계정 ID'));

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
