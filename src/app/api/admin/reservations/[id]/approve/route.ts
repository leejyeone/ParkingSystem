import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { approveReservationSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { approveReservation } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/reservations/[id]/approve
 * 승인과 주차면 배정을 하나의 트랜잭션으로 처리한다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');
    const payload = approveReservationSchema.parse(await readJsonBody(request));

    const reservation = await approveReservation({
      reservationId,
      spaceId: payload.spaceId ?? null,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      reservationNo: reservation.reservationNo,
      reservationStatus: reservation.reservationStatus,
      assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
      assignedSpaceType: reservation.assignedSpace?.spaceType ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
