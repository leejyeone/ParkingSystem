import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { markExitSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markCompanyVehicleExit } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/company-vehicle-trips/[id]/exit — 실제 출차 처리 (PARKING → EXITED) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = markExitSchema.parse(await readJsonBody(request));

    const trip = await markCompanyVehicleExit({
      tripId: parseNumericId(id, '운행 신청 ID'),
      actualExitAt: zonedInputToUtc(payload.actualExitAt),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      tripStatus: trip.tripStatus,
      actualExitAt: trip.actualExitAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
