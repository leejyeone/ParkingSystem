import type { Metadata } from 'next';
import Link from 'next/link';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { EmployeeProfilePanel } from '@/components/employee/employee-profile-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKstRange } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { listReservationsForEmployee } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

/**
 * 직원의 "내 신청 내역" — 방문객 마이페이지와 같은 역할이다.
 * 신청한 예약을 조회하고(카드를 누르면 상세로 이동), 내 정보를 수정할 수 있다.
 */
export default async function EmployeeReservationsPage() {
  const session = await requireEmployeePage('/employee/reservations');
  const [settings, profile] = await Promise.all([
    getSystemSettings(),
    getEmployeeProfile(session.employeeUserId),
  ]);
  const reservations = await listReservationsForEmployee(session.employeeUserId, {
    entryExitManagementEnabled: settings.entryExitManagementEnabled,
  });
  const showSpace = settings.spaceAssignmentEnabled;

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/employee" className="text-brand-700 text-sm font-semibold">
            ← 직원 홈
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
          {profile && (
            <p className="mt-1 text-sm text-slate-600">
              {profile.branchName} {profile.name}님, 안녕하세요.
            </p>
          )}
        </div>
        <EmployeeLogoutButton />
      </div>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">내 예약 ({reservations.length}건)</h2>
          <p className="field-hint">
            수정·취소는 승인 대기 상태에서만 가능합니다.
            <br />
            승인 완료된 예약의 변경이 필요하면 담당자에게 문의해 주세요.
          </p>

          {reservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">아직 신청한 예약이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reservations.map((reservation) => (
                <li key={reservation.reservationId}>
                  {/*
                    상태와 무관하게 모두 상세로 이동할 수 있다.
                    수정·취소 가능 여부는 이동한 화면에서 판단해 안내한다.
                  */}
                  <Link
                    href={`/employee/reservations/${reservation.reservationId}`}
                    className="hover:border-brand-500 block rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {reservation.reservationNo}
                      </span>
                      <div className="flex items-center gap-2">
                        {reservation.requesterType === 'VISITOR' && (
                          <span className="badge bg-slate-100 text-slate-700">
                            {reservation.companyOrBranchName}
                          </span>
                        )}
                        <StatusBadge status={reservation.displayStatus} />
                      </div>
                    </div>
                    <dl className="mt-2 space-y-1 text-sm text-slate-700">
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">
                          방문 시간
                        </dt>
                        <dd>{formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">성명</dt>
                        <dd>{reservation.requesterName}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">차량번호</dt>
                        <dd className="font-mono">{reservation.vehicleNo}</dd>
                      </div>
                      {showSpace && (
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">
                            배정 위치
                          </dt>
                          <dd>{reservation.assignedSpaceCode ?? '승인 후 배정'}</dd>
                        </div>
                      )}
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {profile && <EmployeeProfilePanel profile={profile} />}
    </main>
  );
}
