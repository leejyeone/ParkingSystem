import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { employeeCompanyVehicleTripMileageSchema } from '@/lib/validation/company-vehicle-schema';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { updateCompanyVehicleTripMileageByEmployee } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/company-vehicle-trips/[id]/mileage — 신청 직원 본인의 주행거리(계기판) 입력.
 * 승인 완료 후 반납 처리 전까지 몇 번이든 저장할 수 있다.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveEmployee();
    const { id } = await context.params;
    const payload = employeeCompanyVehicleTripMileageSchema.parse(await readJsonBody(request));

    const trip = await updateCompanyVehicleTripMileageByEmployee({
      tripId: parseNumericId(id, '신청 ID'),
      employeeUserId: session.employeeUserId,
      odometerStartKm: payload.odometerStartKm,
      odometerEndKm: payload.odometerEndKm,
      manualDistanceKm: payload.manualDistanceKm,
    });

    return apiSuccess({
      tripId: trip.tripId,
      odometerStartKm: trip.odometerStartKm,
      odometerEndKm: trip.odometerEndKm,
      manualDistanceKm: trip.manualDistanceKm,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
