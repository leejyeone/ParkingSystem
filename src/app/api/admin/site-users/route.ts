import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { listSiteUsers } from '@/services/site-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/site-users — 회원(SiteUser) 계정 목록.
 * 시스템 관리자 전용.
 */
export async function GET() {
  try {
    await requireActiveSystemAdmin();
    return apiSuccess(await listSiteUsers());
  } catch (error) {
    return handleApiError(error);
  }
}
