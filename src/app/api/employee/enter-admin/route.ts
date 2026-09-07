import { NextResponse, type NextRequest } from 'next/server';

import { getRequestContext } from '@/lib/request-context';
import { consumeRateLimit } from '@/lib/rate-limit';
import { setAdminSessionCookie } from '@/lib/session';
import { loginAdminViaEmployeeSso } from '@/services/admin-auth-service';
import { requireActiveEmployee } from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/employee/enter-admin — 직원 세션 이메일이 관리자 계정과 일치하면
 * 비밀번호 없이 관리자 세션을 발급하고 관리자 화면으로 보낸다.
 *
 * 직원 홈(`/employee`)의 "관리자 화면으로 이동" 버튼이 이 라우트로 바로 링크한다.
 * 실패 사유(비인증/미매칭/레이트리밋)는 구분해서 알려주지 않고 조용히 직원 홈으로 돌려보낸다.
 */
export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request.headers);
    const employeeSession = await requireActiveEmployee();

    consumeRateLimit({
      key: `employee:enter-admin:${employeeSession.employeeUserId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const adminSession = await loginAdminViaEmployeeSso(employeeSession.email, context);
    await setAdminSessionCookie(adminSession);

    return NextResponse.redirect(new URL('/admin', request.url));
  } catch {
    return NextResponse.redirect(new URL('/employee?error=admin_sso_failed', request.url));
  }
}
