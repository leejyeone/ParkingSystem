import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { setEmployeeSessionCookie } from '@/lib/employee-session';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { employeeLoginSchema } from '@/lib/validation/employee-schema';
import { loginEmployee } from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/employee/auth/login — 직원 로그인 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `employee:login:${ipAddress ?? 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const payload = employeeLoginSchema.parse(await readJsonBody(request));
    const session = await loginEmployee(payload);
    await setEmployeeSessionCookie(session);

    return apiSuccess({ email: session.email, name: session.name });
  } catch (error) {
    return handleApiError(error);
  }
}
