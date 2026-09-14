import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/company-vehicle-trips — 운행 신청 목록. ?vehicleId= 로 특정 차량만 필터. */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const vehicleIdParam = new URL(request.url).searchParams.get('vehicleId');
    const vehicleId = vehicleIdParam ? Number(vehicleIdParam) : undefined;

    const trips = await listCompanyVehicleTrips({
      vehicleId: vehicleId && Number.isFinite(vehicleId) ? vehicleId : undefined,
    });

    return apiSuccess({ trips });
  } catch (error) {
    return handleApiError(error);
  }
}
