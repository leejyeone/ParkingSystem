import { AdminRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import type { AdminSession } from '@/lib/session';
import { requireActiveAdmin } from '@/services/admin-auth-service';

/**
 * 관리자 화면(Server Component) 접근 가드.
 * 미인증이면 로그인 페이지로, 권한 부족이면 대시보드로 되돌린다.
 */
export async function requireAdminPage(redirectTo: string): Promise<AdminSession> {
  try {
    return await requireActiveAdmin();
  } catch {
    redirect(`/admin/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
}

export async function requireSystemAdminPage(redirectTo: string): Promise<AdminSession> {
  const session = await requireAdminPage(redirectTo);
  if (session.roleCode !== AdminRole.SYSTEM_ADMIN) {
    redirect('/admin?error=forbidden');
  }
  return session;
}
