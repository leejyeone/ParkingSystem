import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { employeeUserUpdateSchema } from '@/lib/validation/employee-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import {
  getEmployeeUserProfileForAdmin,
  updateEmployeeUser,
} from '@/services/employee-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/employees/[id] — 반복 예약 등록 등에서 직원 선택 시 성명·이메일·차량번호 자동완성용 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveAdmin();
    const { id } = await context.params;
    return apiSuccess(await getEmployeeUserProfileForAdmin(parseNumericId(id, '직원 계정 ID')));
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/admin/employees/[id] — 직원 계정 수정(이름/소속) 또는 활성·비활성 전환 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = employeeUserUpdateSchema.parse(await readJsonBody(request));

    const updated = await updateEmployeeUser(parseNumericId(id, '직원 계정 ID'), payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
