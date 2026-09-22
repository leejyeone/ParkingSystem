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
 * DELETE /api/admin/company-vehicles/[id] — 법인차량 삭제(소프트 삭제 — `deletedAt`을
 * 채우고 행은 남긴다. `deleteCompanyVehicle` 주석 참고). 물리적으로 지우지 않으므로 운행
 * 이력(CompanyVehicleTrip)이 있어도 그대로 삭제되고, 과거 기록은 운행 대장에 남는다 —
 * 이력이 있으면 막고 비활성화만 안내하는 것은 `deactivateCompanyVehicle`(PATCH
 * isActive:false, 목록에는 계속 남기고 싶을 때 쓰는 별도 API)이다.
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
