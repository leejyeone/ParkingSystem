import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { createReservationSchema } from '@/lib/validation/reservation-schema';
import { createReservation } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations
 * 비로그인 주차 예약 신청.
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
      message: '주차 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const body = await request.json();
    const payload = createReservationSchema.parse(body);

    const { reservation } = await createReservation({
      requesterType: payload.requesterType,
      companyOrBranchName: payload.companyOrBranchName,
      departmentName: payload.departmentName,
      requesterName: payload.requesterName,
      requesterEmail: payload.requesterEmail,
      requesterPhone: payload.requesterPhone,
      vehicleNo: payload.vehicleNo,
      visitPurpose: payload.visitPurpose,
      requestMemo: payload.requestMemo,
      visitStartAt: payload.visitStartAt,
      visitEndAt: payload.visitEndAt,
      privacyConsent: payload.privacyConsent,
    });

    return apiSuccess(
      {
        reservationNo: reservation.reservationNo,
        reservationStatus: reservation.reservationStatus,
        visitStartAt: reservation.visitStartAt.toISOString(),
        visitEndAt: reservation.visitEndAt.toISOString(),
        visitRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
        emailNoticeSentTo: reservation.requesterEmail.replace(/^(.).*(@.*)$/, '$1***$2'),
      },
      undefined,
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
