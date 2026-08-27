import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { skipRecurringOccurrenceSchema } from '@/lib/validation/recurring-reservation-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { skipRecurringOccurrence } from '@/services/recurring-reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/reservations/[id]/skip-recurring
 * 반복 예약 시리즈 중 이 날짜(occurrence) 하나만 제외(취소) 처리한다 — 연차 등의 사유로
 * 그 날은 자리를 쓰지 않아도 될 때 쓴다. 시리즈 자체는 그대로 유지된다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const reservationId = parseNumericId(id, '예약 ID');
    const payload = skipRecurringOccurrenceSchema.parse(await readJsonBody(request));

    await skipRecurringOccurrence(reservationId, payload.reason, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ reservationId });
  } catch (error) {
    return handleApiError(error);
  }
}
