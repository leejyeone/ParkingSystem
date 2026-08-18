import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { setAdminSessionCookie } from '@/lib/session';
import { adminLoginSchema } from '@/lib/validation/admin-schema';
import { loginAdmin } from '@/services/admin-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/auth/login */
export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request.headers);
    consumeRateLimit({
      key: `admin:login:${context.ipAddress ?? 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const payload = adminLoginSchema.parse(await request.json());
    const session = await loginAdmin({ ...payload, context });
    await setAdminSessionCookie(session);

    return apiSuccess({
      adminName: session.adminName,
      roleCode: session.roleCode,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
