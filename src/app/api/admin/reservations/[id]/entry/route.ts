import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { markEntrySchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markEntry } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/reservations/[id]/entry — 실제 입차 처리 (APPROVED → PARKING) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = markEntrySchema.parse(await readJsonBody(request));

    const reservation = await markEntry({
      reservationId: parseNumericId(id, '예약 ID'),
      actualEntryAt: zonedInputToUtc(payload.actualEntryAt),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      reservationStatus: reservation.reservationStatus,
      actualEntryAt: reservation.actualEntryAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
