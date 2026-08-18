import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { getReservationDetailForAdmin } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { listAvailableSpaces } from '@/services/space-recommendation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/reservations/[id]
 * 개인정보 원문이 포함되므로 조회 즉시 audit_logs 에 열람 이력을 남긴다.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');

    const reservation = await getReservationDetailForAdmin(reservationId, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    const settings = await getSystemSettings();
    const availableSpaces = await listAvailableSpaces({
      visitStartAt: reservation.visitStartAt,
      visitEndAt: reservation.visitEndAt,
      excludeReservationId: reservationId,
      doubleParkingEnabled: settings.doubleParkingEnabled,
    });

    return apiSuccess({ reservation, availableSpaces });
  } catch (error) {
    return handleApiError(error);
  }
}
