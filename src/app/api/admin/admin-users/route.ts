import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { adminUserCreateSchema } from '@/lib/validation/admin-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { createAdminUser, listAdminUsers } from '@/services/admin-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/admin-users — 관리자 계정 목록. 시스템 관리자 전용 화면에서만 쓴다. */
export async function GET() {
  try {
    await requireActiveSystemAdmin();
    return apiSuccess(await listAdminUsers());
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/admin-users — 관리자 계정 생성. role(시스템 관리자/주차 관리자)은
 * 요청 본문에서 그대로 받는다 — 이 라우트 자체가 이미 시스템 관리자만 호출할 수 있으므로
 * (requireActiveSystemAdmin), 주차 관리자가 스스로를 승격시키는 경로가 되지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveSystemAdmin();
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
