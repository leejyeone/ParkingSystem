import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { reservationLookupSchema } from '@/lib/validation/user-schema';
import { lookupByReservationNo } from '@/services/reservation-lookup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations/lookup
 * 예약번호로 예약을 조회한다.
 *
 * - 예약번호가 URL·서버 로그·Referer 헤더에 남지 않도록 GET 이 아닌 POST 를 사용한다.
 * - 예약번호만으로 조회가 가능하므로, 대입 공격 방어는 이 레이트 리밋이 핵심이다.
 * - 조회에 성공하면 짧은 유효시간의 접근 토큰 경로를 돌려주고, 화면은 그 경로로 이동한다.
 *   (같은 사이트 안에서만 이동하도록 절대 URL 이 아닌 상대 경로를 반환한다)
 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `reservation:lookup:${ipAddress ?? 'unknown'}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '조회 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = reservationLookupSchema.parse(await readJsonBody(request));
    const { rawToken } = await lookupByReservationNo(payload.reservationNo);

    return apiSuccess({ accessPath: `/r/${encodeURIComponent(rawToken)}` });
  } catch (error) {
    return handleApiError(error);
  }
}
