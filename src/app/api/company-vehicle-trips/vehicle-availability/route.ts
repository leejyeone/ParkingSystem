import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { ValidationError } from '@/lib/errors';
import { kstDayRangeUtc } from '@/lib/datetime';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import { getVehicleAvailabilityForDate } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/company-vehicle-trips/vehicle-availability?date=YYYY-MM-DD[&excludeTripId=N]
 * 법인차량 신청 화면의 차량 선택 그리드용 — 그 날짜(KST)에 걸치는 활성 차량별 기존
 * 예약(승인 대기 포함) 구간을 돌려준다. `excludeTripId`는 신청자 본인 수정 화면에서
 * 지금 고치고 있는 신청 자체를 "이미 차 있는 시간대"로 잡지 않기 위해 쓴다.
 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveEmployee();

    const date = request.nextUrl.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('올바른 날짜를 지정해 주세요.', { date: ['올바른 날짜를 지정해 주세요.'] });
    }
    const excludeTripIdParam = request.nextUrl.searchParams.get('excludeTripId');
    const excludeTripId =
      excludeTripIdParam && Number(excludeTripIdParam) > 0 ? Number(excludeTripIdParam) : undefined;

    const range = kstDayRangeUtc(date);
    const vehicles = await getVehicleAvailabilityForDate(range, excludeTripId);

    return apiSuccess({
      vehicles: vehicles.map((vehicle) => ({
        vehicleId: vehicle.vehicleId,
        vehicleNo: vehicle.vehicleNo,
        vehicleModel: vehicle.vehicleModel,
        parkingSpaceCode: vehicle.parkingSpaceCode,
        busyRanges: vehicle.busyRanges.map((rangeItem) => ({
          start: rangeItem.start.toISOString(),
          end: rangeItem.end.toISOString(),
        })),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
