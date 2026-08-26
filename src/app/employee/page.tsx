import type { Metadata } from 'next';
import Link from 'next/link';

import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 홈' };

export default async function EmployeeHomePage() {
  const session = await requireEmployeePage('/employee');
  const [profile, settings] = await Promise.all([
    getEmployeeProfile(session.employeeUserId),
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
  ]);

  return (
    <main className="app-container">
      <header className="mb-6 text-center">
        <p className="text-brand-700 text-xs font-bold tracking-widest">SYNOPEX VISIT</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">시노펙스 방문 예약</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {[profile?.branchName ?? '소속 정보 없음', profile?.department, profile?.name ?? session.name]
            .filter(Boolean)
            .join(' ')}
          님, 안녕하세요.
        </p>
      </header>

      <nav className="grid gap-3">
        <Link href="/employee/reservations/new" className="btn btn-primary btn-lg w-full">
          내 방문 신청
        </Link>
        <Link href="/employee/reservations/proxy" className="btn btn-primary btn-lg w-full">
          방문객 대리 신청
        </Link>
        <Link href="/employee/reservations" className="btn btn-secondary btn-lg w-full">
          마이페이지
        </Link>
      </nav>

      <section className="card mt-6">
        <div className="card-body">
          <h2 className="card-title">이용 안내</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              • 주차장 운영시간은 <strong>{settings.parkingOpenTime}</strong> ~{' '}
              <strong>{settings.parkingCloseTime}</strong> 입니다.
            </li>
            <li>
              • 신청은 방문 시작 <strong>{settings.reservationMinLeadMinutes}분 전</strong>까지
              가능하며, 같은 시점까지 수정·취소할 수 있습니다.
            </li>
            <li>
              {settings.spaceAssignmentEnabled
                ? '• 주차 위치는 관리자가 배정합니다. 직접 선택할 수 없습니다.'
                : '• 주차 위치는 지정되지 않습니다. 승인 후 현장 안내에 따라 주차해 주세요.'}
            </li>
            <li>
              • 방문객을 대신 신청할 때는 방문객의 개인정보 수집·이용 동의를 미리 확인해 주세요.
            </li>
            <li>• 신청 결과와 예약 조회 링크는 신청 시 입력한 이메일로 발송됩니다.</li>
            <li>
              • 출차 예정 <strong>{settings.exitReminderMinutes}분 전</strong>에 안내 메일이
              발송됩니다.
            </li>
          </ul>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs text-slate-400">
        <p>본 시스템은 사내 업무용으로만 사용됩니다.</p>
      </footer>
    </main>
  );
}
