import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { todayKstDateString } from '@/lib/datetime';
import { dateStringSchema } from '@/lib/validation/common';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { getDashboardData } from '@/services/dashboard-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/dashboard?date=yyyy-MM-dd */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();

    const rawDate = request.nextUrl.searchParams.get('date');
    const date = rawDate ? dateStringSchema.parse(rawDate) : todayKstDateString();

    return apiSuccess(await getDashboardData(date));
  } catch (error) {
    return handleApiError(error);
  }
}
