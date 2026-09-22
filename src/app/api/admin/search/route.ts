import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { employeeSearchSchema } from '@/lib/validation/employee-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { searchCompanyVehicleTripsForAdmin } from '@/services/company-vehicle-trip-service';
import { searchReservationsForAdmin } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/search
 * 관리자 대시보드 상단바 통합 검색 — 예약(방문·직원)과 법인차량 운행 신청을 한 번에 검색해
 * 각각 상위 5건을 돌려준다. 두 테이블이 서로 다른 목록/상세 화면을 쓰기 때문에(`/admin/reservations`
 * vs `/admin/company-vehicles/trips`) 결과를 그룹으로 나눠 반환한다.
 */
export async function POST(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `admin-search:${ipAddress ?? 'unknown'}`,
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: '검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const { query } = employeeSearchSchema.parse(await readJsonBody(request));
    const [reservations, vehicleTrips] = await Promise.all([
      searchReservationsForAdmin(query),
      searchCompanyVehicleTripsForAdmin(query),
    ]);

    return apiSuccess({ reservations, vehicleTrips });
  } catch (error) {
    return handleApiError(error);
  }
}
