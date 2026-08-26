import { apiSuccess, handleApiError } from '@/lib/api-response';
import { clearEmployeeSessionCookie } from '@/lib/employee-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/employee/auth/logout — 직원 로그아웃 */
export async function POST() {
  try {
    await clearEmployeeSessionCookie();
    return apiSuccess({ loggedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
