import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { parkingSpaceCreateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin, requireSystemAdmin } from '@/services/admin-auth-service';
import {
  createParkingSpace,
  listParkingAreas,
  listParkingSpaces,
} from '@/services/parking-space-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/parking-spaces — 주차면 목록 (모든 관리자 조회 가능) */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';

    const [areas, spaces] = await Promise.all([
      listParkingAreas(),
      listParkingSpaces({ includeInactive }),
    ]);

    return apiSuccess({ areas, spaces });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/parking-spaces — 주차면 생성 (SYSTEM_ADMIN 전용) */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const payload = parkingSpaceCreateSchema.parse(await readJsonBody(request));

    const created = await createParkingSpace(payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(created, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
