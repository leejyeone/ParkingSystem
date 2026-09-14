import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { formatKstDate, formatKstRange, kstDayRangeUtc } from '@/lib/datetime';
import { findMatchingAdminAccount } from '@/services/admin-auth-service';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { listReservationsForEmployee } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

const RECENT_RESERVATIONS_LIMIT = 5;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 홈' };

export default async function EmployeeHomePage() {
  const session = await requireEmployeePage('/employee');
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);
  const [profile, matchingAdmin, recentReservations] = await Promise.all([
    getEmployeeProfile(session.employeeUserId),
    findMatchingAdminAccount(session.email),
    listReservationsForEmployee(session.employeeUserId, {
      page: 1,
      pageSize: RECENT_RESERVATIONS_LIMIT,
      entryExitManagementEnabled: settings.entryExitManagementEnabled,
      // 오늘(KST 00:00) 이후 예약만 — 지난 방문 이력은 마이페이지에서 본다.
      fromDate: kstDayRangeUtc(formatKstDate(new Date())).start,
      order: 'asc',
    }),
  ]);

  return (
    <main className="app-container">
      <div className="flex items-center justify-end gap-3">
        <div className="text-right">
          <span className="block text-sm font-bold whitespace-nowrap text-slate-900">
            {profile?.name ?? session.name}
          </span>
          {profile?.departmentName && (
            <span className="block text-xs whitespace-nowrap text-slate-500">
              {profile.departmentName}
            </span>
          )}
        </div>
        <Link
          href="/employee/profile"
          className="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold whitespace-nowrap text-sky-600 transition hover:bg-sky-100"
        >
          MY
        </Link>
        <EmployeeLogoutButton confirmMessage="로그아웃하면 다시 그룹웨어를 통해 접속해야 합니다. 로그아웃하시겠습니까?" />
      </div>

      <header className="mb-6 mt-3 text-center">
        <div className="flex justify-center">
          <Image src="/synopex-logo.png" alt="Synopex" width={175} height={50} priority />
        </div>
        <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">시노펙스 방문 예약</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {[profile?.departmentName, profile?.name ?? session.name].filter(Boolean).join(' ')}
          님, 안녕하세요.
        </p>
      </header>

      <nav className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/employee/reservations/new" className="btn btn-primary btn-lg w-full">
            내 방문 신청
          </Link>
          <Link href="/employee/reservations/proxy" className="btn btn-primary btn-lg w-full">
            방문객 대리 신청
          </Link>
        </div>
        <Link href="/employee/company-vehicle/new" className="btn btn-primary btn-lg w-full">
          법인 차량 신청
        </Link>
        {matchingAdmin && (
          <Link href="/api/employee/enter-admin" className="btn btn-secondary btn-lg w-full">
            관리자 대시보드
          </Link>
        )}
      </nav>

      <section className="card mt-6">
        <div className="card-body">
          <div className="flex items-center justify-between gap-2">
            <h2 className="card-title">최근 예약 현황</h2>
            <Link href="/employee/reservations" className="text-brand-700 text-xs font-bold">
              전체보기
            </Link>
          </div>

          {recentReservations.items.length === 0 ? (
            <p className="text-ink-faint mt-3 text-sm">신청 내역이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentReservations.items.map((reservation) => (
                <li key={reservation.reservationId}>
                  <Link
                    href={`/employee/reservations/${reservation.reservationId}`}
                    className="hover:border-brand-500 border-line hover:bg-surface-hover flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 transition"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="badge bg-surface-active text-ink-muted">
                          {reservation.requesterType === 'EMPLOYEE'
                            ? '본인'
                            : REQUESTER_TYPE_LABEL[reservation.requesterType]}
                        </span>
                        {reservation.requesterType !== 'EMPLOYEE' && (
                          <span className="text-ink text-sm font-bold">
                            {reservation.companyOrBranchName}
                          </span>
                        )}
                        <span className="text-ink-muted text-sm">{reservation.requesterName}</span>
                      </div>
                      <p className="text-ink-faint mt-1 text-xs">
                        {formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}
                      </p>
                    </div>
                    <StatusBadge status={reservation.displayStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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

    </main>
  );
}
