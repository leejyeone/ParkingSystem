import { redirect } from 'next/navigation';

import { requireActiveEmployee } from '@/services/employee-auth-service';
import type { EmployeeSession } from '@/lib/employee-session';

const PHONE_REQUIRED_PATH = '/employee/profile';

/**
 * 직원 전용 화면(Server Component) 접근 가드.
 * 미인증이면 직원 로그인 화면(개발용 사번 진입 화면)으로 보낸다.
 *
 * 전화번호가 없는 직원(그룹웨어 실시간 동기화로 새로 들어와 phone 이 비어 있는 경우 등)은
 * 마이페이지 외 다른 화면을 열 수 없다 — "당사 담당자" 이름+전화번호 검증에 쓰이는 값이라
 * 없으면 방문객이 이 직원을 담당자로 등록할 방법이 없기 때문이다. 마이페이지(자기 자신)
 * 요청만은 무한 리다이렉트를 막기 위해 그대로 통과시킨다.
 */
export async function requireEmployeePage(redirectTo: string): Promise<EmployeeSession> {
  let session: EmployeeSession & { phone: string | null };
  try {
    session = await requireActiveEmployee();
  } catch {
    redirect(`/employee/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  if (!session.phone && redirectTo !== PHONE_REQUIRED_PATH) {
    redirect(`${PHONE_REQUIRED_PATH}?reason=phone_required`);
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
