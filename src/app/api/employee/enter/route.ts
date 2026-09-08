import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { getEmployeeEntryKey } from '@/lib/env';
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
 * 사내망(그룹웨어)의 "다른 사이트 로그인 연동" 링크가 실제로 착지하는 지점이다.
 * 그 링크는 `/?fsacode=사번` 형태로 루트 경로에 붙어서 오므로, 루트 페이지
 * (`src/app/page.tsx`)가 `fsacode` 파라미터를 감지해 이 라우트로 리다이렉트한다.
 * `?fsacode=` 로 직접 들어와도 인식하도록 이 라우트 자체도 `empId` 의 별칭으로 받는다.
 * 비밀번호가 없으므로 계정별 잠금이 불가능해, 사번 무작위 대입을 늦추기 위한 유일한
 * 방어선으로 IP 기준 레이트리밋을 건다.
 *
 * `?email=` 파라미터가 오면 이메일(그룹웨어 SYSMAIL)로 진입한다 — 개발 편의용이 아니라,
 * 사번이 그룹웨어에서 유일하지 않아 명부에 사번을 아예 못 넣은 직원의 유일한 로그인
 * 경로다(`page.tsx`가 `/?email=SYSMAIL`를 그대로 넘겨준다).
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

    assertEntryKey(request);

    const redirectTo = safeEmployeeRedirect(
      request.nextUrl.searchParams.get('redirect') ?? undefined,
    );

    const emailParam = request.nextUrl.searchParams.get('email');
    const empIdParam =
      request.nextUrl.searchParams.get('empId') ?? request.nextUrl.searchParams.get('fsacode');
    const session = emailParam
      ? await enterByEmail(employeeEmailEntrySchema.parse({ email: emailParam }).email)
      : await enterByEmployeeCode(
          employeeCodeEntrySchema.parse({ employeeCode: empIdParam ?? '' }).employeeCode,
        );

    await setEmployeeSessionCookie(session);

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch {
    return NextResponse.redirect(new URL('/employee/login?error=not_found', request.url));
  }
}

/**
 * 그룹웨어 메뉴에만 넣어 둔 공유 비밀값(`k`)을 확인한다.
 *
 * EMPLOYEE_ENTRY_KEY 를 설정하지 않으면 무조건 실패한다 — "운영에서는 반드시 설정할 것"이라는
 * 주석 하나에만 기대면 설정을 깜빡했을 때 이 라우트가 통째로 무방비 상태가 되므로, 키
 * 자체를 필수로 만들어 설정 실수를 안전한 쪽(막힘)으로 처리한다. 로컬 개발/E2E는 `.env` /
 * `playwright.config.ts` 가 이미 값을 채워 두므로 영향 없다.
 *
 * 값 비교에 timingSafeEqual 을 쓴다. 일반 문자열 비교는 앞에서부터 틀린 위치까지만 확인하고
 * 끝나서, 응답 시간 차이로 한 글자씩 값을 알아낼 여지가 생긴다.
 *
 * 실패해도 이유를 알려 주지 않고 사번/메일이 틀렸을 때와 똑같은 화면으로 보낸다.
 * "키는 맞는데 계정이 없다" 는 정보 자체가 단서가 되기 때문이다.
 */
function assertEntryKey(request: NextRequest): void {
  const expected = getEmployeeEntryKey();
  if (!expected) {
    throw new Error('entry key not configured');
  }

  const provided = request.nextUrl.searchParams.get('k') ?? '';
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    throw new Error('entry key mismatch');
  }
}
