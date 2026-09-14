import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { markEntrySchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markCompanyVehicleEntry } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/company-vehicle-trips/[id]/entry — 실제 입차 처리 (APPROVED → PARKING) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = markEntrySchema.parse(await readJsonBody(request));

    const trip = await markCompanyVehicleEntry({
      tripId: parseNumericId(id, '운행 신청 ID'),
      actualEntryAt: zonedInputToUtc(payload.actualEntryAt),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      tripStatus: trip.tripStatus,
      actualEntryAt: trip.actualEntryAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
