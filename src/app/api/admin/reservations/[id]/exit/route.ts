import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markExit } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/reservations/[id]/exit — 실제 출차 처리 (PARKING → EXITED) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;

    const reservation = await markExit({
      reservationId: parseNumericId(id, '예약 ID'),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      reservationStatus: reservation.reservationStatus,
      actualExitAt: reservation.actualExitAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
