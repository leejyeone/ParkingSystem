import { getEmployeeSession } from '@/lib/employee-session';

/**
 * "처음으로" 류 링크가 가야 할 곳.
 * 직원으로 로그인한 상태면 방문객 메인이 아니라 직원 홈으로 보내야 한다.
 */
export async function resolveHomeHref(): Promise<string> {
  const employeeSession = await getEmployeeSession();
  return employeeSession ? '/employee' : '/';
}
