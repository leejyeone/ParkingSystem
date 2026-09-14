import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { companyVehicleTripDetailUpdateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import {
  getCompanyVehicleTripDetail,
  updateCompanyVehicleTripDetails,
} from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/company-vehicle-trips/[id] — 운행 신청 상세 + 배정 가능 차량 목록 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveAdmin();
    const { id } = await context.params;
    const tripId = parseNumericId(id, '운행 신청 ID');

    const trip = await getCompanyVehicleTripDetail(tripId);
    const vehicles = await listCompanyVehicles();

    return apiSuccess({ trip, vehicles });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/admin/company-vehicle-trips/[id] — 운행 대장에서 신청 내용(행선지·사유·운행시간) 정정 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = companyVehicleTripDetailUpdateSchema.parse(await readJsonBody(request));

    const trip = await updateCompanyVehicleTripDetails({
      tripId: parseNumericId(id, '운행 신청 ID'),
      destination: payload.destination,
      reason: payload.reason,
      requestStartAt: payload.requestStartAt,
      requestEndAt: payload.requestEndAt,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      destination: trip.destination,
      reason: trip.reason,
      requestStartAt: trip.requestStartAt,
      requestEndAt: trip.requestEndAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
