import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { employeeUserBulkStatusSchema } from '@/lib/validation/employee-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { bulkUpdateEmployeeStatus } from '@/services/employee-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/employees/bulk-status — 선택한 직원 계정을 한 번에 활성화/비활성화한다. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();
    const payload = employeeUserBulkStatusSchema.parse(await readJsonBody(request));

    const result = await bulkUpdateEmployeeStatus({
      employeeUserIds: payload.employeeUserIds,
      accountStatus: payload.accountStatus,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
