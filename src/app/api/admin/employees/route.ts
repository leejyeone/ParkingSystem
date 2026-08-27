import { apiSuccess, handleApiError } from '@/lib/api-response';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listEmployeeUsers } from '@/services/employee-user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/employees — 직원 계정 목록 (계정 생성은 명부 시드 스크립트로만 이루어진다) */
export async function GET() {
  try {
    await requireActiveAdmin();
    return apiSuccess(await listEmployeeUsers());
  } catch (error) {
    return handleApiError(error);
  }
}
