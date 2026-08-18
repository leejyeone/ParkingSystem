import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { setUserSessionCookie } from '@/lib/user-session';
import { signUpSchema } from '@/lib/validation/user-schema';
import { signUpUser } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/signup — 회원가입 후 바로 로그인 상태로 만든다. */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `user:signup:${ipAddress ?? 'unknown'}`,
      limit: 10,
      windowMs: 60 * 60 * 1000,
      message: '가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const payload = signUpSchema.parse(await readJsonBody(request));
    const session = await signUpUser(payload);
    await setUserSessionCookie(session);

    return apiSuccess({ email: session.email, name: session.name }, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
