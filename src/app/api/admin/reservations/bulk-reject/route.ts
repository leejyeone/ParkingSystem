import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { bulkRejectReservationSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { bulkRejectReservations } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/reservations/bulk-reject — 승인 대기 건을 같은 사유로 한 번에 반려한다. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();
    const payload = bulkRejectReservationSchema.parse(await readJsonBody(request));

    const result = await bulkRejectReservations({
      reservationIds: payload.reservationIds,
      rejectionReason: payload.rejectionReason,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
