import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { setUserSessionCookie } from '@/lib/user-session';
import { userLoginSchema } from '@/lib/validation/user-schema';
import { loginUser } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/login — 회원 로그인 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `user:login:${ipAddress ?? 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const payload = userLoginSchema.parse(await readJsonBody(request));
    const session = await loginUser(payload);
    await setUserSessionCookie(session);

    return apiSuccess({ email: session.email, name: session.name });
  } catch (error) {
    return handleApiError(error);
  }
}
