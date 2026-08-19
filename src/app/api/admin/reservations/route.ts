import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { kstDayRangeUtc } from '@/lib/datetime';
import { getRequestContext } from '@/lib/request-context';
import { reservationListQuerySchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listReservationsForAdmin } from '@/services/reservation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reservations
 * 목록에도 성명/이메일/차량번호 원문이 포함되므로 열람 이력을 감사 로그에 남긴다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();

    const query = reservationListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    const range = query.date ? kstDayRangeUtc(query.date) : null;

    const result = await listReservationsForAdmin(
      {
        dateFrom: range?.start,
        dateTo: range?.end,
        status: query.status,
        requesterType: query.requesterType,
        vehicleNo: query.vehicleNo,
        requesterName: query.requesterName,
        spaceCode: query.spaceCode,
        page: query.page,
        pageSize: query.pageSize,
      },
      {
        adminUserId: session.adminUserId,
        requestContext: getRequestContext(request.headers),
      },
    );

    return apiSuccess(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
