import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { getEmployeeEntryKey } from '@/lib/env';
import { getEmployeeSession } from '@/lib/employee-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string; error?: string }> };

/**
 * 개발 중에만 쓰는 이메일 진입 화면.
 *
 * 실제 운영 환경에서는 그룹웨어가 `page.asp?Fsacode=사번` 형태의 링크로 이미 로그인된
 * 사용자를 이 화면 없이 곧바로 `GET /api/employee/enter?empId=사번`으로 연결한다(운영
 * 계약은 그대로 사번 기반). 이 화면은 사번이 기억하기 어려운 개발 중에만 쓰는 보조
 * 경로라, 이메일을 입력하면 내부적으로 사번을 찾아 세션을 발급한다. 비밀번호는 없다.
 */
export default async function EmployeeLoginPage({ searchParams }: PageProps) {
  const session = await getEmployeeSession();
  const { redirect: redirectParam, error } = await searchParams;
  const redirectTo = safeEmployeeRedirect(redirectParam);

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mt-2 text-2xl font-black text-slate-900">직원 로그인</h1>
        <p className="mt-1 text-sm text-slate-600">
          실제 운영 환경에서는 그룹웨어에서 자동으로 연결되며, 이 화면은 개발 중에만 사용합니다.
        </p>
      </div>

      {error === 'not_found' && (
        <div className="mb-4">
          <Alert variant="error">등록되지 않은 이메일입니다. 관리자에게 문의해 주세요.</Alert>
        </div>
      )}

      <form action="/api/employee/enter" method="GET" className="card">
        <div className="card-body space-y-4">
          <div>
            <label htmlFor="email" className="label label-required">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="이메일을 입력해 주세요"
              autoComplete="off"
              required
            />
          </div>
          <input type="hidden" name="redirect" value={redirectTo} />
          {/*
            /api/employee/enter 는 EMPLOYEE_ENTRY_KEY 가 설정되면 k 파라미터를 요구한다.
            이 화면은 서버가 이미 아는 그 값을 그대로 실어 보낸다 — 그룹웨어 메뉴 링크에
            k 가 박혀 있는 것과 같은 수준이라 새로운 노출이 아니다. 키가 비어 있으면
            assertEntryKey 가 검사를 건너뛰므로 빈 문자열이어도 무해하다.
          */}
          <input type="hidden" name="k" value={getEmployeeEntryKey() ?? ''} />
          <button type="submit" className="btn btn-primary w-full">
            진입하기
          </button>
        </div>
      </form>
    </main>
  );
}
