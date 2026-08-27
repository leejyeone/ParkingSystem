import { redirect } from 'next/navigation';

import { requireActiveEmployee } from '@/services/employee-auth-service';
import type { EmployeeSession } from '@/lib/employee-session';

/**
 * 직원 전용 화면(Server Component) 접근 가드.
 * 미인증이면 직원 로그인 화면(개발용 사번 진입 화면)으로 보낸다.
 */
export async function requireEmployeePage(redirectTo: string): Promise<EmployeeSession> {
  try {
    return await requireActiveEmployee();
  } catch {
    redirect(`/employee/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
}

/**
 * 로그인 후 돌려보낼 경로를 검증한다.
 * 열린 리다이렉트를 막기 위해 내부 직원 경로만 허용한다.
 */
export function safeEmployeeRedirect(redirectParam: string | undefined): string {
  if (!redirectParam) return '/employee';
  if (!redirectParam.startsWith('/') || redirectParam.startsWith('//')) return '/employee';
  return redirectParam.startsWith('/employee') ? redirectParam : '/employee';
}
