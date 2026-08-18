import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { noShowReservationSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markNoShow } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/reservations/[id]/no-show — 미방문 처리 (APPROVED → NO_SHOW) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = noShowReservationSchema.parse(await readJsonBody(request));

    const reservation = await markNoShow({
      reservationId: parseNumericId(id, '예약 ID'),
      reason: payload.reason ?? undefined,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      reservationStatus: reservation.reservationStatus,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
