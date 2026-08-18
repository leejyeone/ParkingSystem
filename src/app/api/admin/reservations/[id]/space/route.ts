import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { assignSpaceSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { changeAssignedSpace } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/reservations/[id]/space
 * 배정 주차면 변경. 트랜잭션 안에서 시간 중복을 다시 검증한다.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = assignSpaceSchema.parse(await readJsonBody(request));

    const reservation = await changeAssignedSpace({
      reservationId: parseNumericId(id, '예약 ID'),
      spaceId: payload.spaceId,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
      assignedSpaceType: reservation.assignedSpace?.spaceType ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
