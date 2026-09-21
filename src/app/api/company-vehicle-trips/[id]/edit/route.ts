import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { createCompanyVehicleTripSchema } from '@/lib/validation/company-vehicle-schema';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { updateCompanyVehicleTripByRequester } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/company-vehicle-trips/[id]/edit — 신청자 본인 수정(승인 대기 상태만). */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveEmployee();
    const { id } = await context.params;
    const payload = createCompanyVehicleTripSchema.parse(await readJsonBody(request));

    const trip = await updateCompanyVehicleTripByRequester({
      tripId: parseNumericId(id, '신청 ID'),
      employeeUserId: session.employeeUserId,
      ...payload,
    });

    return apiSuccess({ tripId: trip.tripId, tripStatus: trip.tripStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
