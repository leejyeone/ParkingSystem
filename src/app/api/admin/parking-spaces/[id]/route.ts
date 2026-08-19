import type { NextRequest } from 'next/server';

import { parseNumericId, readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { parkingSpaceUpdateSchema } from '@/lib/validation/admin-schema';
import { requireSystemAdmin } from '@/services/admin-auth-service';
import { deleteParkingSpace, updateParkingSpace } from '@/services/parking-space-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/admin/parking-spaces/[id] — 주차면 수정/비활성화 (SYSTEM_ADMIN 전용) */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSystemAdmin();
    const { id } = await context.params;
    const payload = parkingSpaceUpdateSchema.parse(await readJsonBody(request));

    const updated = await updateParkingSpace(parseNumericId(id, '주차면 ID'), payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/admin/parking-spaces/[id] — 주차면 삭제 (SYSTEM_ADMIN 전용)
 * 예약 이력이 있는 주차면은 삭제되지 않고 409 로 거부된다.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSystemAdmin();
    const { id } = await context.params;

    const result = await deleteParkingSpace(parseNumericId(id, '주차면 ID'), {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
