import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { assertEmployeePhoneRegistered, requireActiveEmployee } from '@/services/employee-auth-service';
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
    assertEmployeePhoneRegistered(session);

    consumeRateLimit({
      key: `reservation:employee:${session.employeeUserId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '방문 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = createEmployeeReservationSchema.parse(await request.json());

    // 성명/이메일은 그룹웨어 명부값이라 신청 폼에서 수정할 수 없다 — 화면에서 막아도 API를
    // 직접 두드리면 우회할 수 있으므로, 클라이언트가 보낸 값은 무시하고 세션의 실제 값으로 덮어쓴다.
    const { reservation } = await createEmployeeReservation(
      { ...payload, requesterName: session.name, requesterEmail: session.email },
      session.employeeUserId,
    );

    return apiSuccess(
      {
        reservationId: reservation.reservationId,
        reservationNo: reservation.reservationNo,
        reservationStatus: reservation.reservationStatus,
        companyOrBranchName: reservation.companyOrBranchName,
        requesterName: reservation.requesterName,
        vehicleNo: reservation.vehicleNo,
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
