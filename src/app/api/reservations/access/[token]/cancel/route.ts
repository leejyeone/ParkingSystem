import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { toRequesterReservationView } from '@/lib/serializers/reservation-view';
import { cancelReservationSchema } from '@/lib/validation/reservation-schema';
import { resolveAccessToken } from '@/services/reservation-access-service';
import {
  cancelReservationByRequester,
  getReservationForRequester,
} from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * POST /api/reservations/access/[token]/cancel
 * 본인 예약 취소. 주차면을 해제하고 취소 사유/시각을 기록한다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `reservation:cancel:${ipAddress ?? 'unknown'}`,
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });

    const resolved = await resolveAccessToken(token);
    const payload = cancelReservationSchema.parse(await request.json());

    await cancelReservationByRequester(resolved.reservationId, payload.cancelReason);
    const [reservation, settings] = await Promise.all([
      getReservationForRequester(resolved.reservationId),
      getSystemSettings(),
    ]);

    return apiSuccess(toRequesterReservationView(reservation, settings.entryExitManagementEnabled));
  } catch (error) {
    return handleApiError(error);
  }
}
