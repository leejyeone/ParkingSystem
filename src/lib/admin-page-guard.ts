import { AdminRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import type { AdminSession } from '@/lib/session';
import { requireActiveAdmin } from '@/services/admin-auth-service';

/**
 * 관리자 화면(Server Component) 접근 가드. 미인증이면 로그인 페이지로 되돌린다.
 * 로그인 여부만 확인하고 권한(role)은 가리지 않는다 — 역할별 제한이 필요한 화면은
 * requireSystemAdminPage() 를 쓴다.
 */
export async function requireAdminPage(redirectTo: string): Promise<AdminSession> {
  try {
    return await requireActiveAdmin();
  } catch {
    redirect(`/admin/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
}

/**
 * 시스템 관리자 전용 화면 접근 가드. 반복 예약·이메일 이력·직원 등록·관리자 계정
 * 관리처럼 방문 신청/승인 절차를 우회할 수 있는 화면에 쓴다. 로그인은 했지만
 * 시스템 관리자가 아니면(주차 관리자) 대시보드로 돌려보낸다 — 그 메뉴 자체가
 * 사이드바에 보이지 않으므로 URL 을 직접 입력해 들어온 경우다.
 */
export async function requireSystemAdminPage(redirectTo: string): Promise<AdminSession> {
  const session = await requireAdminPage(redirectTo);
  if (session.role !== AdminRole.SYSTEM_ADMIN) {
    redirect('/admin?error=forbidden');
  }
  return session;
}
