import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { getEmployeeEntryKey, isEmployeeDevLoginAllowed } from '@/lib/env';
import { getEmployeeSession } from '@/lib/employee-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string; error?: string }> };

/**
 * 직원 로그인 진입점.
 *
 * 실제 운영 환경에서는 그룹웨어가 `page.asp?Fsacode=사번` 형태의 링크로 이미 로그인된
 * 사용자를 이 화면 없이 곧바로 `GET /api/employee/enter?empId=사번`으로 연결한다(운영
 * 계약은 그대로 사번 기반). 다만 세션 쿠키가 없는 상태로 `/employee/**`에 접근하면
 * `proxy.ts`가 누구든 이 경로로 돌려보내므로(로그아웃 직후, 세션 만료 등), 운영에서도
 * 이 페이지 자체는 계속 열려 있어야 한다 — 없애면 재로그인 안내가 404로 깨진다.
 *
 * 이메일 진입 폼(비밀번호 없이 이메일만으로 세션 발급)은 사번이 기억하기 어려운
 * 개발 중에만 쓰는 보조 경로라 프로덕션에서는 절대 렌더링하지 않는다 — 이 폼을 운영에
 * 노출하면 관리자 이메일을 포함한 아무 직원 이메일이나 알아내는 것만으로 로그인이
 * 가능해진다(관리자 계정과 이메일이 같으면 관리자 화면까지 그대로 넘어간다). 운영에서는
 * 안내 문구만 보여주고, 실제 재진입은 그룹웨어 메뉴를 통해서만 하도록 한다.
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
          {isEmployeeDevLoginAllowed()
            ? '실제 운영 환경에서는 그룹웨어에서 자동으로 연결되며, 이 화면은 개발 중에만 사용합니다.'
            : '세션이 만료되었거나 로그인되어 있지 않습니다. 그룹웨어 메뉴에서 다시 접속해 주세요.'}
        </p>
      </div>

      {error === 'not_found' && (
        <div className="mb-4">
          <Alert variant="error">등록되지 않은 이메일입니다. 관리자에게 문의해 주세요.</Alert>
        </div>
      )}

      {isEmployeeDevLoginAllowed() && (
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
              개발 편의로 서버가 아는 값을 그대로 실어 보낸다 — 이 폼 자체가 진짜 운영에는
              전혀 렌더링되지 않으므로(isEmployeeDevLoginAllowed() 분기) 운영 키가 공개
              HTML로 새어나갈 일은 없다. E2E 는 ALLOW_EMPLOYEE_DEV_LOGIN=true 로 이 폼을
              켜 두고 쓰는데, 그 값은 이 폼 자체를 열지 말지에만 쓰이고 k 값과는 무관하다.
            */}
            <input type="hidden" name="k" value={getEmployeeEntryKey() ?? ''} />
            <button type="submit" className="btn btn-primary w-full">
              진입하기
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
