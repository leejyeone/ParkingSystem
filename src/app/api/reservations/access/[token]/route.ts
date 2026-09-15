import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { toRequesterReservationView } from '@/lib/serializers/reservation-view';
import { updateReservationSchema } from '@/lib/validation/reservation-schema';
import { resolveAccessToken } from '@/services/reservation-access-service';
import {
  getReservationForRequester,
  updateReservationByRequester,
} from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/reservations/access/[token]
 * 이메일로 발송된 보안 토큰으로 본인 예약 1건을 조회한다.
 * 예약번호만으로는 절대 조회할 수 없다.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    guardTokenRate(request);

    const resolved = await resolveAccessToken(token);
    const [reservation, settings] = await Promise.all([
      getReservationForRequester(resolved.reservationId),
      getSystemSettings(),
    ]);

    return apiSuccess(toRequesterReservationView(reservation, settings.entryExitManagementEnabled));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/reservations/access/[token]
 * 본인 예약 수정. 승인 대기(REQUESTED) 상태에서만 가능하다.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    guardTokenRate(request);

    const resolved = await resolveAccessToken(token);
    const payload = updateReservationSchema.parse(await request.json());

    await updateReservationByRequester(resolved.reservationId, payload);
    const [reservation, settings] = await Promise.all([
      getReservationForRequester(resolved.reservationId),
      getSystemSettings(),
    ]);

    return apiSuccess(toRequesterReservationView(reservation, settings.entryExitManagementEnabled));
  } catch (error) {
    return handleApiError(error);
  }
}

function guardTokenRate(request: NextRequest): void {
  const { ipAddress } = getRequestContext(request.headers);
  consumeRateLimit({
    key: `reservation:access:${ipAddress ?? 'unknown'}`,
    limit: 60,
    windowMs: 10 * 60 * 1000,
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  });
}
