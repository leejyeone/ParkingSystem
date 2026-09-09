import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listSiteUsers } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/site-users — 회원(SiteUser) 계정 목록.
 * 로그인한 관리자면 역할과 무관하게 접근 가능.
 */
export async function GET() {
  try {
    await requireActiveAdmin();
    return apiSuccess(await listSiteUsers());
  } catch (error) {
    return handleApiError(error);
  }
}
