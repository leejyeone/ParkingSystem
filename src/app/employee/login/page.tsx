import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { safeEmployeeRedirect } from '@/lib/employee-page-guard';
import { requireActiveEmployee } from '@/services/employee-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 로그인' };

type PageProps = { searchParams: Promise<{ redirect?: string; error?: string }> };

/**
 * 직원 로그인 진입점.
 *
 * 실제 운영에서는 그룹웨어가 `page.asp?Fsacode=사번` 형태의 링크로 이미 로그인된 사용자를
 * 이 화면 없이 곧바로 `GET /api/employee/enter?empId=사번`으로 연결한다. 다만 세션 쿠키가
 * 없는 상태로 `/employee/**`에 접근하면(로그아웃 직후, 세션 만료 등) `proxy.ts`가 누구든
 * 이 경로로 돌려보내므로, 이 페이지는 안내문 용도로 계속 남아 있어야 한다 — 없애면
 * 재로그인 안내가 404로 깨진다.
 *
 * 이 화면 자체에는 재로그인 수단이 없다 — 세션을 다시 받는 유일한 방법은 그룹웨어 →
 * 업무사이트 → "시노펙스 방문예약" 메뉴를 처음부터 다시 타는 것뿐이다. (예전에 있던
 * 이메일 입력 폼은 비밀번호 없이 이메일만으로 로그인되는 개발 편의용 보조 경로였는데,
 * 운영 배포 시 숨김 처리가 누락되면서 실제로 뚫린 적이 있어 코드에서 완전히 제거했다.)
 */
export default async function EmployeeLoginPage({ searchParams }: PageProps) {
  // 쿠키 서명만 유효하고 계정이 비활성/삭제된 경우까지 "로그인됨"으로 보면, 이 화면과
  // 보호 화면(requireEmployeePage) 사이에서 서로 되돌려보내는 리다이렉트 루프가 생긴다.
  // 계정 상태까지 확인하는 requireActiveEmployee()로 판단해야 한다.
  const session = await requireActiveEmployee().catch(() => null);
  const { redirect: redirectParam, error } = await searchParams;
  const redirectTo = safeEmployeeRedirect(redirectParam);

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="app-container max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mt-2 text-2xl font-black text-slate-900">직원 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">세션이 만료되었거나 로그인되어 있지 않습니다.</p>
      </div>

      <div className="card mb-4 -mx-4 sm:-mx-6">
        <div className="card-body text-center">
          <p className="text-ink-muted mb-3 text-sm font-semibold">아래 경로로 다시 접속해 주세요</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="bg-brand-50 text-brand-700 rounded-full px-3 py-1.5 text-sm font-bold">
              그룹웨어
            </span>
            <span className="text-ink-faint">→</span>
            <span className="bg-brand-50 text-brand-700 rounded-full px-3 py-1.5 text-sm font-bold">
              업무사이트
            </span>
            <span className="text-ink-faint">→</span>
            <span className="bg-brand-700 rounded-full px-3 py-1.5 text-sm font-bold text-white">
              시노펙스 방문예약
            </span>
          </div>
        </div>
      </div>

      {error === 'not_found' && (
        <div className="mb-4">
          <Alert variant="error">등록되지 않은 사번입니다. 관리자에게 문의해 주세요.</Alert>
        </div>
      )}
    </main>
  );
}
