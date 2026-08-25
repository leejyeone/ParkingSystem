import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { reservationLookupAccessSchema } from '@/lib/validation/user-schema';
import { issueAccessTokenByNameAndVehicle } from '@/services/reservation-lookup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations/lookup/access
 *
 * 성명·차량번호 조회 목록에서 고른 예약의 접근 토큰을 발급한다. reservationId 뿐 아니라
 * 성명·차량번호도 함께 받아 다시 검증하므로, 목록 API 가 돌려준 reservationId 를 다른 값으로
 * 바꿔 보내도 그 예약의 성명·차량번호와 일치하지 않으면 토큰이 나오지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `reservation:lookup:access:${ipAddress ?? 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: '조회 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = reservationLookupAccessSchema.parse(await readJsonBody(request));
    const rawToken = await issueAccessTokenByNameAndVehicle(payload);

    return apiSuccess({ accessPath: `/r/${encodeURIComponent(rawToken)}` });
  } catch (error) {
    return handleApiError(error);
  }
}
