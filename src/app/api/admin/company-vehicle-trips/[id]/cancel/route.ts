import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { companyVehicleTripCancelSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { cancelCompanyVehicleTripByAdmin } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/company-vehicle-trips/[id]/cancel — 관리자 취소 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = companyVehicleTripCancelSchema.parse(await readJsonBody(request));

    const trip = await cancelCompanyVehicleTripByAdmin({
      tripId: parseNumericId(id, '운행 신청 ID'),
      cancelReason: payload.cancelReason,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ tripId: trip.tripId, tripStatus: trip.tripStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
