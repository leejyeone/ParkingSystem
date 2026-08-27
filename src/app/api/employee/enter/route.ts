import { NextResponse, type NextRequest } from 'next/server';

import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { setEmployeeSessionCookie } from '@/lib/employee-session';
import { getRequestContext } from '@/lib/request-context';
import { consumeRateLimit } from '@/lib/rate-limit';
import {
  employeeCodeEntrySchema,
  employeeEmailEntrySchema,
} from '@/lib/validation/employee-schema';
import { enterByEmail, enterByEmployeeCode } from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/employee/enter?empId=사번 — 사번으로 세션 발급 (운영 계약).
 *
 * 그룹웨어 링크(`page.asp?Fsacode=사번`)가 실제로 착지하는 지점이다. 비밀번호가 없으므로
 * 계정별 잠금이 불가능해, 사번 무작위 대입을 늦추기 위한 유일한 방어선으로 IP 기준
 * 레이트리밋을 건다.
 *
 * `?email=` 파라미터가 오면 개발 편의용 이메일 진입으로 처리한다(`/employee/login` 개발용
 * 진입 폼 전용) — 사번은 기억하기 어려우니 그룹웨어 연동 전까지만 쓰는 보조 경로다.
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

    const redirectTo = safeEmployeeRedirect(
      request.nextUrl.searchParams.get('redirect') ?? undefined,
    );

    const emailParam = request.nextUrl.searchParams.get('email');
    const session = emailParam
      ? await enterByEmail(employeeEmailEntrySchema.parse({ email: emailParam }).email)
      : await enterByEmployeeCode(
          employeeCodeEntrySchema.parse({
            employeeCode: request.nextUrl.searchParams.get('empId') ?? '',
          }).employeeCode,
        );

    await setEmployeeSessionCookie(session);

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch {
    return NextResponse.redirect(new URL('/employee/login?error=not_found', request.url));
  }
}
