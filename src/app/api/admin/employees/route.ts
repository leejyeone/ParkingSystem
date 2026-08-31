import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { employeeUserCreateSchema } from '@/lib/validation/employee-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { createEmployeeUser, listEmployeeUsers } from '@/services/employee-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/employees — 직원 계정 목록.
 * 시스템 관리자 전용.
 */
export async function GET() {
  try {
    await requireActiveSystemAdmin();
    return apiSuccess(await listEmployeeUsers());
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/employees — 직원 계정 직접 생성 (명부 시드 없이도 등록 가능).
 * 시스템 관리자 전용.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveSystemAdmin();
    const payload = employeeUserCreateSchema.parse(await readJsonBody(request));

    const created = await createEmployeeUser(payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(created, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
