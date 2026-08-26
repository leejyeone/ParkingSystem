import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { parkingAreaUpdateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { updateParkingArea } from '@/services/parking-space-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/parking-areas/[id] — 구역 정보/도면 이미지 URL 수정 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;
    const payload = parkingAreaUpdateSchema.parse(await readJsonBody(request));

    const updated = await updateParkingArea(parseNumericId(id, '구역 ID'), payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
