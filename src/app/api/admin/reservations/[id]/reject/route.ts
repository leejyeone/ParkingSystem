import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { rejectReservationSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { rejectReservation } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/reservations/[id]/reject */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');
    const payload = rejectReservationSchema.parse(await readJsonBody(request));

    const reservation = await rejectReservation({
      reservationId,
      rejectionReason: payload.rejectionReason,
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
