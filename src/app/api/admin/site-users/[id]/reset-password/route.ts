import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { resetSiteUserPassword } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/site-users/[id]/reset-password — 회원 비밀번호를 고정 비밀번호
 * (`SITE_USER_RESET_PASSWORD`)로 초기화한다. 로그인한 관리자면 역할과 무관하게 접근 가능.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveAdmin();
    const { id } = await context.params;

    const result = await resetSiteUserPassword(parseNumericId(id, '회원 계정 ID'));

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
