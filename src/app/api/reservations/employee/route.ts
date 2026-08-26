import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createEmployeeReservationSchema } from '@/lib/validation/reservation-schema';
import { createEmployeeReservation } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations/employee
 * 직원 본인 방문 신청. 로그인이 필수이며 개인정보 동의 카드는 없다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveEmployee();

    consumeRateLimit({
      key: `reservation:employee:${session.employeeUserId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '방문 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = createEmployeeReservationSchema.parse(await request.json());

    const { reservation } = await createEmployeeReservation(payload, session.employeeUserId);

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
