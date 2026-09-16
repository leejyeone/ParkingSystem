import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getEmployeeSession } from '@/lib/employee-session';
import { getRequestContext } from '@/lib/request-context';
import { clearAdminSessionCookie, getAdminSession } from '@/lib/session';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/logout
 *
 * 직원 세션(그룹웨어 SSO로 관리자에 들어온 경우)이 함께 살아있으면 로그아웃 후 돌아갈
 * 곳을 직원 홈으로 잡아 준다 — SSO로 들어온 관리자가 로그아웃할 때마다 쓰지도 않는
 * ID/비밀번호 로그인 화면을 보게 하지 않기 위함이다. 직원 세션이 없으면(ID/비밀번호로
 * 직접 로그인한 경우) 기존과 동일하게 관리자 로그인 화면으로 보낸다. 권한 판단이 아니라
 * 리다이렉트 목적지 선택일 뿐이라 DB 재조회 없이 세션 쿠키 존재만 확인한다.
 */
export async function POST(request: NextRequest) {
  try {
    const [session, employeeSession] = await Promise.all([
      getAdminSession(),
      getEmployeeSession(),
    ]);
    await clearAdminSessionCookie();

    if (session) {
      await writeAuditLog({
        actorAdminId: session.adminUserId,
        actionType: AUDIT_ACTIONS.ADMIN_LOGOUT,
        targetType: AUDIT_TARGETS.ADMIN_USER,
        targetId: session.adminUserId,
        context: getRequestContext(request.headers),
      });
    }

    return apiSuccess({
      loggedOut: true,
      redirectTo: employeeSession ? '/employee' : '/admin/login',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
