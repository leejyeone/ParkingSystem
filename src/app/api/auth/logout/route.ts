import { apiSuccess, handleApiError } from '@/lib/api-response';
import { clearUserSessionCookie } from '@/lib/user-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — 회원 로그아웃 */
export async function POST() {
  try {
    await clearUserSessionCookie();
    return apiSuccess({ loggedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
