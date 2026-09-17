import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { confirmCompanyVehicleReturnSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { confirmCompanyVehicleReturn } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/company-vehicle-trips/[id]/confirm-return — (PARKING → EXITED)
 * 신청 직원이 "반납 처리"한 뒤, 관리자가 차량 상태를 확인하고 반납을 최종 확정한다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = confirmCompanyVehicleReturnSchema.parse(await readJsonBody(request));

    const trip = await confirmCompanyVehicleReturn({
      tripId: parseNumericId(id, '운행 신청 ID'),
      confirmMemo: payload.confirmMemo,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ tripId: trip.tripId, tripStatus: trip.tripStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
