import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { reservationLookupSchema } from '@/lib/validation/user-schema';
import { lookupByNameAndVehicle } from '@/services/reservation-lookup-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations/lookup
 * 예약자 성명 + 차량번호(AND 조건)로 일치하는 예약 목록을 조회한다.
 *
 * - 서버 로그·Referer 헤더에 개인정보가 남지 않도록 GET 이 아닌 POST 를 사용한다.
 * - 이 응답만으로는 예약 상세에 접근할 수 없다 — 목록에서 고른 건은
 *   /api/reservations/lookup/access 에서 성명·차량번호를 다시 검증해 토큰을 내준다.
 * - 예약번호 조회보다 입력 조합이 흔해 대입 공격 여지가 크므로 레이트 리밋을 핵심 방어로 둔다.
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
    const reservations = await lookupByNameAndVehicle(payload);

    return apiSuccess({
      reservations: reservations.map((reservation) => ({
        reservationId: reservation.reservationId,
        visitStartAt: reservation.visitStartAt.toISOString(),
        visitEndAt: reservation.visitEndAt.toISOString(),
        reservationStatus: reservation.reservationStatus,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
