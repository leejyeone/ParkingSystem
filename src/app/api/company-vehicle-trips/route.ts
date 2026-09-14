import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createCompanyVehicleTripSchema } from '@/lib/validation/company-vehicle-schema';
import { assertEmployeePhoneRegistered, requireActiveEmployee } from '@/services/employee-auth-service';
import { createCompanyVehicleTrip } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/company-vehicle-trips
 * 직원이 법인 공용 차량 운행을 신청한다. 로그인이 필수이며, 어떤 차량을 배정할지는
 * 관리자가 승인 시점에 정하므로 신청 단계에서는 받지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveEmployee();
    assertEmployeePhoneRegistered(session);

    consumeRateLimit({
      key: `company-vehicle-trip:${session.employeeUserId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '법인차량 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const payload = createCompanyVehicleTripSchema.parse(await request.json());

    const trip = await createCompanyVehicleTrip(payload, session.employeeUserId);

    return apiSuccess(
      {
        tripId: trip.tripId,
        tripStatus: trip.tripStatus,
      },
      undefined,
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
