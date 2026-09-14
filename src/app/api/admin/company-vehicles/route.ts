import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { companyVehicleCreateSchema } from '@/lib/validation/admin-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { createCompanyVehicle, listCompanyVehicles } from '@/services/company-vehicle-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/company-vehicles — 법인차량 목록 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
    const vehicles = await listCompanyVehicles({ includeInactive });
    return apiSuccess({ vehicles });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/company-vehicles — 법인차량 등록 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveAdmin();
    const payload = companyVehicleCreateSchema.parse(await readJsonBody(request));

    const vehicle = await createCompanyVehicle(payload, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ vehicle }, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
