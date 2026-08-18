import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { parkingAreaCreateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin, requireSystemAdmin } from '@/services/admin-auth-service';
import { createParkingArea, listParkingAreas } from '@/services/parking-space-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/parking-areas — 주차 구역 목록 */
export async function GET() {
  try {
    await requireActiveAdmin();
    return apiSuccess(await listParkingAreas());
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/parking-areas — 주차 구역 생성 (SYSTEM_ADMIN 전용) */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const payload = parkingAreaCreateSchema.parse(await readJsonBody(request));

    const created = await createParkingArea(payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(created, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
