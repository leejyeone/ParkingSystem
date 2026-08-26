import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/ui/status-badge';
import { formatKstRange } from '@/lib/datetime';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { listReservationsForEmployee } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '내 신청 내역' };

export default async function EmployeeReservationsPage() {
  const session = await requireEmployeePage('/employee/reservations');
  const settings = await getSystemSettings();
  const reservations = await listReservationsForEmployee(session.employeeUserId, {
    entryExitManagementEnabled: settings.entryExitManagementEnabled,
  });
  const showSpace = settings.spaceAssignmentEnabled;

  return (
    <main className="app-container space-y-4">
      <div>
        <Link href="/employee" className="text-brand-700 text-sm font-semibold">
          ← 직원 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">내 신청 내역</h1>
      </div>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">신청 내역 ({reservations.length}건)</h2>

          {reservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">아직 신청한 예약이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reservations.map((reservation) => (
                <li
                  key={reservation.reservationId}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {reservation.reservationNo}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-slate-100 text-slate-700">
                        {reservation.requesterType === 'EMPLOYEE' ? '내 방문' : '대신 신청함'}
                      </span>
                      <StatusBadge status={reservation.displayStatus} />
                    </div>
                  </div>
                  <dl className="mt-2 space-y-1 text-sm text-slate-700">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">방문 시간</dt>
                      <dd>{formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">신청자</dt>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
