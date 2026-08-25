import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { entryExitRecordSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { updateEntryExitRecords } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/reservations/[id]/entry-exit-record
 *
 * 이미 기록된 실제 입·출차 시각을 수정하거나(값 전달), 삭제해 처리 이전 상태로
 * 되돌린다(null 전달). 상태 전이 자체(입차/출차 처리)는 entry, exit 라우트가 맡는다.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = entryExitRecordSchema.parse(await readJsonBody(request));

    const reservation = await updateEntryExitRecords({
      reservationId: parseNumericId(id, '예약 ID'),
      actualEntryAt:
        payload.actualEntryAt === undefined
          ? undefined
          : payload.actualEntryAt === null
            ? null
            : zonedInputToUtc(payload.actualEntryAt),
      actualExitAt:
        payload.actualExitAt === undefined
          ? undefined
          : payload.actualExitAt === null
            ? null
            : zonedInputToUtc(payload.actualExitAt),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      reservationId: reservation.reservationId,
      reservationStatus: reservation.reservationStatus,
      actualEntryAt: reservation.actualEntryAt?.toISOString() ?? null,
      actualExitAt: reservation.actualExitAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
