import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createEmployeeProxyReservationSchema } from '@/lib/validation/reservation-schema';
import { createProxyReservationForVisitor } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations/employee/proxy
 * 직원이 담당 방문객을 대신 신청한다. 로그인이 필수이며, 방문객의 개인정보 수집·이용
 * 동의는 방문객 본인이 아니라 직원이 "확인했음"을 대신 체크하는 방식으로 처리한다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveEmployee();

    consumeRateLimit({
      key: `reservation:employee-proxy:${session.employeeUserId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '방문 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = createEmployeeProxyReservationSchema.parse(await request.json());
    const { visitorConsentConfirmed, ...rest } = payload;

    const { reservation } = await createProxyReservationForVisitor(
      { ...rest, privacyConsent: visitorConsentConfirmed },
      session.employeeUserId,
    );

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
