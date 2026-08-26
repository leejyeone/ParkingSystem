import { redirect } from 'next/navigation';

import {
  requireActiveEmployee,
  type ActiveEmployeeSession,
} from '@/services/employee-auth-service';

/** 첫 로그인 비밀번호 강제 변경 화면. 이 경로 자신은 이 가드에서 리다이렉트되지 않는다. */
export const EMPLOYEE_CHANGE_PASSWORD_PATH = '/employee/change-password';

/**
 * 직원 전용 화면(Server Component) 접근 가드.
 * 미인증이면 직원 로그인 페이지로 보낸다.
 * 비밀번호를 강제로 바꿔야 하는 계정(관리자가 만든 계정의 첫 로그인)이면
 * 다른 화면 대신 비밀번호 변경 화면으로 보낸다.
 */
export async function requireEmployeePage(redirectTo: string): Promise<ActiveEmployeeSession> {
  let session: ActiveEmployeeSession;
  try {
    session = await requireActiveEmployee();
  } catch {
    redirect(`/employee/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  if (session.mustChangePassword && redirectTo !== EMPLOYEE_CHANGE_PASSWORD_PATH) {
    redirect(EMPLOYEE_CHANGE_PASSWORD_PATH);
  }

  return session;
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
