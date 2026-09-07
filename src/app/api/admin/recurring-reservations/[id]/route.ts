import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { updateRecurringScheduleSchema } from '@/lib/validation/recurring-reservation-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import {
  deleteRecurringSchedule,
  updateRecurringSchedule,
} from '@/services/recurring-reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/recurring-reservations/[id] — 반복 일정(요일·시간·기간) 수정. 시스템 관리자 전용. */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveSystemAdmin();
    const { id } = await context.params;
    const scheduleId = parseNumericId(id, '반복 예약 일정 ID');
    const payload = updateRecurringScheduleSchema.parse(await readJsonBody(request));

    const result = await updateRecurringSchedule(
      scheduleId,
      {
        startDate: payload.startDate,
        endDate: payload.endDate,
        weekdaysMask: payload.weekdays,
        dailyStartTime: payload.dailyStartTime,
        dailyEndTime: payload.dailyEndTime,
        approvalEnabled: payload.approvalEnabled,
        autoEntryExitEnabled: payload.autoEntryExitEnabled,
        hiddenFromReservationList: payload.hiddenFromReservationList,
      },
      {
        adminUserId: session.adminUserId,
        requestContext: getRequestContext(request.headers),
      },
    );

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/admin/recurring-reservations/[id] — 반복 예약 일정 삭제. 시스템 관리자 전용. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveSystemAdmin();
    const { id } = await context.params;
    const scheduleId = parseNumericId(id, '반복 예약 일정 ID');

    const result = await deleteRecurringSchedule(scheduleId, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
