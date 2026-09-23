import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { ValidationError } from '@/lib/errors';
import { kstDayRangeUtc } from '@/lib/datetime';
import { requireActiveEmployee } from '@/services/employee-auth-service';
import {
  getActiveVehicleList,
  getActiveVehicleListWithConflict,
  getVehicleAvailabilityForDate,
} from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/company-vehicle-trips/vehicle-availability?date=YYYY-MM-DD[&excludeTripId=N]
 * 법인차량 신청 화면의 차량 선택 그리드용 — 그 날짜(KST)에 걸치는 활성 차량별 기존
 * 예약(승인 대기 포함) 구간을 돌려준다. `excludeTripId`는 신청자 본인 수정 화면에서
 * 지금 고치고 있는 신청 자체를 "이미 차 있는 시간대"로 잡지 않기 위해 쓴다.
 *
 * `date`를 생략하면(시간 제약 예외 신청 화면) 날짜 기준 가용성 계산 없이 활성 차량
 * 전체 목록을 돌려준다 — 예외 신청은 여러 날짜에 걸칠 수 있어 미리 판단할 수 없으므로,
 * 중복 배정 여부는 관리자가 승인 시점에 직접 확인한다. 이때 `requestStartAt`/
 * `requestEndAt`(ISO)을 함께 주면, 그 범위로 실제 겹치는 차량만 `hasConflict: true`로
 * 표시해 화면에서 경고를 띄울 수 있게 한다(막지는 않는다).
 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveEmployee();

    const date = request.nextUrl.searchParams.get('date');
    const excludeTripIdParam = request.nextUrl.searchParams.get('excludeTripId');
    const excludeTripId =
      excludeTripIdParam && Number(excludeTripIdParam) > 0 ? Number(excludeTripIdParam) : undefined;

    let vehicles;
    if (date === null) {
      const requestStartAtParam = request.nextUrl.searchParams.get('requestStartAt');
      const requestEndAtParam = request.nextUrl.searchParams.get('requestEndAt');
      if (requestStartAtParam && requestEndAtParam) {
        const requestStartAt = new Date(requestStartAtParam);
        const requestEndAt = new Date(requestEndAtParam);
        if (Number.isNaN(requestStartAt.getTime()) || Number.isNaN(requestEndAt.getTime())) {
          throw new ValidationError('올바른 시간을 지정해 주세요.', {
            requestStartAt: ['올바른 시간을 지정해 주세요.'],
          });
        }
        vehicles = await getActiveVehicleListWithConflict({
          requestStartAt,
          requestEndAt,
          excludeTripId,
        });
      } else {
        vehicles = await getActiveVehicleList();
      }
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ValidationError('올바른 날짜를 지정해 주세요.', { date: ['올바른 날짜를 지정해 주세요.'] });
      }
      vehicles = await getVehicleAvailabilityForDate(kstDayRangeUtc(date), excludeTripId);
    }

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
        hasConflict: vehicle.hasConflict,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
