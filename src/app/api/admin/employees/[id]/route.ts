import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { employeeUserUpdateSchema } from '@/lib/validation/employee-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { updateEmployeeUser } from '@/services/employee-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

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
