import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { companyVehicleUpdateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { deleteCompanyVehicle, updateCompanyVehicle } from '@/services/company-vehicle-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/admin/company-vehicles/[id] — 법인차량 정보 수정 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = companyVehicleUpdateSchema.parse(await readJsonBody(request));

    const vehicle = await updateCompanyVehicle(parseNumericId(id, '차량 ID'), payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ vehicle });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/admin/company-vehicles/[id] — 법인차량 완전 삭제. 운행 이력이 있으면
 * 서비스 단에서 막고 비활성화를 안내한다(deactivateCompanyVehicle, PATCH isActive:false).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;

    const result = await deleteCompanyVehicle(parseNumericId(id, '차량 ID'), {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
