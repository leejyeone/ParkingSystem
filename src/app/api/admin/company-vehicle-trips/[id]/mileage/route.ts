import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { companyVehicleTripMileageSchema } from '@/lib/validation/admin-schema';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { updateCompanyVehicleTripMileage } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/company-vehicle-trips/[id]/mileage — 주행거리(계기판) 기록 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = companyVehicleTripMileageSchema.parse(await readJsonBody(request));

    const trip = await updateCompanyVehicleTripMileage({
      tripId: parseNumericId(id, '운행 신청 ID'),
      odometerStartKm: payload.odometerStartKm,
      odometerEndKm: payload.odometerEndKm,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      odometerStartKm: trip.odometerStartKm,
      odometerEndKm: trip.odometerEndKm,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
