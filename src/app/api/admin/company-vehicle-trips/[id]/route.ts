import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { companyVehicleTripDetailUpdateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicles } from '@/services/company-vehicle-service';
import {
  getCompanyVehicleTripDetail,
  updateCompanyVehicleTripDetails,
} from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/company-vehicle-trips/[id] — 운행 신청 상세 + 배정 가능 차량 목록 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireActiveAdmin();
    const { id } = await context.params;
    const tripId = parseNumericId(id, '운행 신청 ID');

    const trip = await getCompanyVehicleTripDetail(tripId);
    const vehicles = await listCompanyVehicles();

    return apiSuccess({ trip, vehicles });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/admin/company-vehicle-trips/[id] — 신청 상세 카드에서 신청 내용(신청
 * 직원·행선지·사유·운행시간)과 운행 기록(배정 차량·반납 처리/확정 시각) 정정
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = companyVehicleTripDetailUpdateSchema.parse(await readJsonBody(request));

    const trip = await updateCompanyVehicleTripDetails({
      tripId: parseNumericId(id, '운행 신청 ID'),
      employeeUserId: payload.employeeUserId,
      destination: payload.destination,
      reason: payload.reason,
      requestStartAt: payload.requestStartAt,
      requestEndAt: payload.requestEndAt,
      assignedVehicleId: payload.assignedVehicleId,
      actualEntryAt: payload.actualEntryAt === null ? null : zonedInputToUtc(payload.actualEntryAt),
      actualExitAt: payload.actualExitAt === null ? null : zonedInputToUtc(payload.actualExitAt),
      timingExceptionReason: payload.timingExceptionReason,
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      employeeUserId: trip.employeeUserId,
      destination: trip.destination,
      reason: trip.reason,
      requestStartAt: trip.requestStartAt,
      requestEndAt: trip.requestEndAt,
      assignedVehicleId: trip.assignedVehicleId,
      actualEntryAt: trip.actualEntryAt,
      actualExitAt: trip.actualExitAt,
      timingExceptionReason: trip.timingExceptionReason,
      timingExceptionApprovedAt: trip.timingExceptionApprovedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
