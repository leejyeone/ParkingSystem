import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { zonedInputToUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { markExitSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { markCompanyVehicleExit } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/company-vehicle-trips/[id]/exit — (PARKING → EXITED)
 * 법인차량은 방문 예약과 입출차 방향이 반대라, 이 처리는 실제로 "입차"(차가 돌아옴)다.
 * 경로/함수명은 상태 전이(PARKING→EXITED) 기준으로 그대로 두고, 화면 문구만 다르게 쓴다.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = markExitSchema.parse(await readJsonBody(request));

    const trip = await markCompanyVehicleExit({
      tripId: parseNumericId(id, '운행 신청 ID'),
      actualExitAt: zonedInputToUtc(payload.actualExitAt),
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({
      tripId: trip.tripId,
      tripStatus: trip.tripStatus,
      actualExitAt: trip.actualExitAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
