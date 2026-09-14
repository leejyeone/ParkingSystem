import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { cancelCompanyVehicleTripSchema } from '@/lib/validation/company-vehicle-schema';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { cancelCompanyVehicleTripByRequester } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/company-vehicle-trips/[id]/cancel — 신청자 본인 취소(승인 대기 상태만). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveEmployee();
    const { id } = await context.params;
    const payload = cancelCompanyVehicleTripSchema.parse(await readJsonBody(request));

    const trip = await cancelCompanyVehicleTripByRequester({
      tripId: parseNumericId(id, '신청 ID'),
      employeeUserId: session.employeeUserId,
      cancelReason: payload.cancelReason,
    });

    return apiSuccess({ tripId: trip.tripId, tripStatus: trip.tripStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
