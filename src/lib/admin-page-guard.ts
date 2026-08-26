import { redirect } from 'next/navigation';

import type { AdminSession } from '@/lib/session';
import { requireActiveAdmin } from '@/services/admin-auth-service';

/**
 * 관리자 화면(Server Component) 접근 가드.
 * 미인증이면 로그인 페이지로 되돌린다. 관리자는 단일 권한만 존재하므로
 * 권한별 접근 제한은 없다.
 */
export async function requireAdminPage(redirectTo: string): Promise<AdminSession> {
  try {
    return await requireActiveAdmin();
  } catch {
    redirect(`/admin/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
}
