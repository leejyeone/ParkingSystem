import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { requestCompanyVehicleReturn } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/company-vehicle-trips/[id]/return — 신청 직원 본인의 "반납 처리"
 * (APPROVED → PARKING). 관리자에게 알림이 가고, 관리자가 확인 후 반납을 확정해야
 * 완전히 종료된다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveEmployee();
    const { id } = await context.params;

    const trip = await requestCompanyVehicleReturn({
      tripId: parseNumericId(id, '신청 ID'),
      employeeUserId: session.employeeUserId,
    });

    return apiSuccess({ tripId: trip.tripId, tripStatus: trip.tripStatus });
  } catch (error) {
    return handleApiError(error);
  }
}
