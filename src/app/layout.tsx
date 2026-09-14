import type { Metadata, Viewport } from 'next';

import { SiteTopBar, type TopBarSession } from '@/components/site-top-bar';
import { getEmployeeSession } from '@/lib/employee-session';
import { getUserSession } from '@/lib/user-session';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '시노펙스 방문 예약 시스템',
    template: '%s | 시노펙스 방문 예약 시스템',
  },
  description: '시노펙스 방문객 및 타 사업장 직원을 위한 방문 예약 관리 시스템입니다.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

/**
 * 상단바에 표시할 세션 우선순위: 직원 > 회원 > 비로그인.
 *
 * 두 조회 모두 쿠키 읽기 + JWT 서명 검증만 하고 DB 조회가 없어 모든 요청(관리자 포함)에서
 * 불러도 비용이 낮다. 여기서는 표시용으로만 쓰며, 레이아웃 자체는 어떤 인증도 강제하지
 * 않는다(리다이렉트 없음) — "레이아웃은 인증하지 않는다, 실제 검증은 각 화면"이라는
 * 기존 정책을 그대로 따른다.
 */
async function resolveTopBarSession(): Promise<TopBarSession> {
  const employeeSession = await getEmployeeSession();
  if (employeeSession) return { kind: 'employee', name: employeeSession.name };

  const userSession = await getUserSession();
  if (userSession) return { kind: 'member', name: userSession.name };

  return { kind: 'anonymous' };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const topBarSession = await resolveTopBarSession();

  return (
    <html lang="ko">
      <body>
        <SiteTopBar session={topBarSession} />
        {children}
      </body>
    </html>
  );
}
