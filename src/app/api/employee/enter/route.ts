import { NextResponse, type NextRequest } from 'next/server';

import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { setEmployeeSessionCookie } from '@/lib/employee-session';
import { getRequestContext } from '@/lib/request-context';
import { consumeRateLimit } from '@/lib/rate-limit';
import { employeeCodeEntrySchema } from '@/lib/validation/employee-schema';
import { enterByEmployeeCode } from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/employee/enter?empId=사번 — 사번으로 세션 발급.
 *
 * 그룹웨어 링크(`page.asp?Fsacode=사번`)가 실제로 착지하는 지점이다. 비밀번호가 없으므로
 * 계정별 잠금이 불가능해, 사번 무작위 대입을 늦추기 위한 유일한 방어선으로 IP 기준
 * 레이트리밋을 건다.
 */
export async function GET(request: NextRequest) {
  const { ipAddress } = getRequestContext(request.headers);

  try {
    consumeRateLimit({
      key: `employee:enter:${ipAddress ?? 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const empId = request.nextUrl.searchParams.get('empId') ?? '';
    const redirectTo = safeEmployeeRedirect(
      request.nextUrl.searchParams.get('redirect') ?? undefined,
    );
    const payload = employeeCodeEntrySchema.parse({ employeeCode: empId });
    const session = await enterByEmployeeCode(payload.employeeCode);
    await setEmployeeSessionCookie(session);

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch {
    return NextResponse.redirect(new URL('/employee/login?error=not_found', request.url));
  }
}
