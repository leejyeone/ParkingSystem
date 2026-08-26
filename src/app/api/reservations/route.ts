import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { getUserSession } from '@/lib/user-session';
import { createReservationSchema } from '@/lib/validation/reservation-schema';
import { createVisitorReservation } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations
 * 방문 예약 신청. 로그인 없이도 신청할 수 있고, 로그인 상태면 예약이 계정에 연결된다.
 *
 * 응답에는 예약번호와 일정만 포함하고, 접근 토큰 링크는 이메일로만 전달한다.
 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `reservation:create:${ipAddress ?? 'unknown'}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '방문 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const body = await request.json();
    const payload = createReservationSchema.parse(body);

    // 로그인 회원이면 예약을 계정에 연결한다. 비로그인 신청도 그대로 허용한다.
    const session = await getUserSession();

    const { reservation } = await createVisitorReservation({
      visitorUserId: session?.userId ?? null,
      companyOrBranchName: payload.companyOrBranchName,
      requesterName: payload.requesterName,
      requesterEmail: payload.requesterEmail,
      vehicleNo: payload.vehicleNo,
      visitPurpose: payload.visitPurpose,
      requestMemo: payload.requestMemo,
      visitStartAt: payload.visitStartAt,
      visitEndAt: payload.visitEndAt,
      privacyConsent: payload.privacyConsent,
    });

    return apiSuccess(
      {
        reservationId: reservation.reservationId,
        reservationNo: reservation.reservationNo,
        reservationStatus: reservation.reservationStatus,
        visitStartAt: reservation.visitStartAt.toISOString(),
        visitEndAt: reservation.visitEndAt.toISOString(),
        visitRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
        emailNoticeSentTo: reservation.requesterEmail,
      },
      undefined,
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
