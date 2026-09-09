import type { Metadata } from 'next';
import Link from 'next/link';

import { EmployeeLogoutButton } from '@/components/employee/employee-logout-button';
import { EmployeeReservationTabs } from '@/components/employee/employee-reservation-tabs';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { getEmployeeProfile } from '@/services/employee-auth-service';
import { listRecurringSchedulesForEmployee } from '@/services/recurring-reservation-service';
import { listReservationsForEmployee } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '예약 내역' };

/** 직원의 "내 신청 내역" — 신청한 예약을 조회한다(카드를 누르면 상세로 이동). */
type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function EmployeeReservationsPage({ searchParams }: PageProps) {
  const session = await requireEmployeePage('/employee/reservations');
  const settings = await getSystemSettings();
  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;
  const [profile, reservationPage, schedules] = await Promise.all([
    getEmployeeProfile(session.employeeUserId),
    // 반복 예약 occurrence 는 여기 포함되지 않는다 — 시리즈 단위 요약(schedules)으로
    // 별도 탭에서 보여준다.
    listReservationsForEmployee(session.employeeUserId, {
      page,
      pageSize: 20,
      entryExitManagementEnabled: settings.entryExitManagementEnabled,
    }),
    listRecurringSchedulesForEmployee(session.employeeUserId),
  ]);
  const { items: reservations, totalCount, totalPages } = reservationPage;
  const showSpace = settings.spaceAssignmentEnabled;

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/employee" className="text-brand-700 text-sm font-semibold">
            ← 직원 홈
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">예약 내역</h1>
          {profile && (
            <p className="mt-1 text-sm text-slate-600">
              {profile.departmentName} {profile.name}님, 안녕하세요.
            </p>
          )}
        </div>
        <EmployeeLogoutButton />
      </div>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">내 예약</h2>
          <p className="field-hint">
            수정·취소는 승인 대기 상태에서만 가능합니다.
            <br />
            승인 완료된 예약의 변경이 필요하면 담당자에게 문의해 주세요. <br />
            <br />
          </p>

          <EmployeeReservationTabs
            reservations={reservations}
            schedules={schedules}
            showSpace={showSpace}
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        </div>
      </section>
    </main>
  );
}
