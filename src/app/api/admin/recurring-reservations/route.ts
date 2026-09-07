import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { createRecurringScheduleSchema } from '@/lib/validation/recurring-reservation-schema';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { createRecurringSchedule } from '@/services/recurring-reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/recurring-reservations — 반복 예약(정기 주차 배정) 시리즈 등록.
 * 시스템 관리자 전용.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveSystemAdmin();
    const payload = createRecurringScheduleSchema.parse(await readJsonBody(request));

    const result = await createRecurringSchedule(
      {
        employeeUserId: payload.employeeUserId,
        spaceId: payload.spaceId,
        requesterName: payload.requesterName,
        requesterEmail: payload.requesterEmail,
        companyOrBranchName: payload.companyOrBranchName,
        vehicleNo: payload.vehicleNo,
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

    return apiSuccess(result, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
