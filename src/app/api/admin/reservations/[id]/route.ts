import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { adminUpdateReservationSchema } from '@/lib/validation/reservation-schema';
import {
  getReservationDetailForAdmin,
  updateReservationByAdmin,
} from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { listAvailableSpaces } from '@/services/space-assignment-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/reservations/[id]
 * 개인정보 원문이 포함되므로 조회 즉시 audit_logs 에 열람 이력을 남긴다.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');

    const reservation = await getReservationDetailForAdmin(reservationId, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    const settings = await getSystemSettings();
    const availableSpaces = await listAvailableSpaces({
      visitStartAt: reservation.visitStartAt,
      visitEndAt: reservation.visitEndAt,
      excludeReservationId: reservationId,
      doubleParkingEnabled: settings.doubleParkingEnabled,
      bufferMinutes: settings.spaceBufferMinutes,
    });

    return apiSuccess({ reservation, availableSpaces });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/admin/reservations/[id]
 *
 * 예약 내용(방문 시간, 차량번호, 상호, 성명 등)을 관리자가 직접 수정한다.
 * 신청자는 승인 대기 + 마감 시각 이전에만 스스로 수정할 수 있으므로,
 * 그 외의 변경 요청("담당자에게 문의")은 이 경로로 처리한다.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');
    const payload = adminUpdateReservationSchema.parse(await readJsonBody(request));

    const updated = await updateReservationByAdmin(reservationId, payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ reservationId: updated.reservationId });
  } catch (error) {
    return handleApiError(error);
  }
}
