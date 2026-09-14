import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import { getCompanyVehicleTripDetail } from '@/services/company-vehicle-trip-service';

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
