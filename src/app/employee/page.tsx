import type { Metadata } from 'next';
import Link from 'next/link';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { ActionCard } from '@/components/ui/action-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { COMPANY_VEHICLE_STATUS_LABEL } from '@/domain/reservation-status';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { findMatchingAdminAccount } from '@/services/admin-auth-service';
import { listRecentActivityForEmployee } from '@/services/employee-activity-service';
import { getSystemSettings } from '@/services/settings-service';

const RECENT_ACTIVITY_LIMIT = 5;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '직원 홈' };

export default async function EmployeeHomePage() {
  const session = await requireEmployeePage('/employee');
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);
  const [matchingAdmin, recentActivity] = await Promise.all([
    findMatchingAdminAccount(session.email),
    listRecentActivityForEmployee(session.employeeUserId, RECENT_ACTIVITY_LIMIT),
  ]);

  return (
    <main className="app-container-medium space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          href="/employee/reservations/new"
          icon={<CarIcon />}
          title="내 방문신청"
          description="본인 차량으로 방문 시 신청합니다."
        />
        <ActionCard
          href="/employee/reservations/proxy"
          icon={<PersonIcon />}
          title="방문객 대리 신청"
          description="타 방문객이 차량 출입 시 대신 신청합니다."
        />
        <ActionCard
          href="/employee/company-vehicle/new"
          icon={<BuildingIcon />}
          title="법인 차량 예약"
          description="법인차량 사용을 예약합니다."
          disabled
        />
      </div>

      {matchingAdmin && (
        <Link href="/api/employee/enter-admin" className="btn btn-secondary btn-lg w-full">
          관리자 대시보드
        </Link>
      )}

      <section className="card">
        <div className="card-body">
          <div className="flex items-center justify-between gap-2">
            <h2 className="card-title">최근 예약 현황</h2>
            <Link href="/employee/reservations" className="text-brand-700 text-xs font-bold">
              전체보기
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <p className="text-ink-faint mt-3 text-sm">신청 내역이 없습니다.</p>
          ) : (
            <div className="table-scroll mt-3">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>방문일시</th>
                    <th className="w-16">성명</th>
                    <th>차량번호</th>
                    <th>목적</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((item) => (
                    <ClickableTableRow key={`${item.kind}-${item.id}`} href={item.href}>
                      <td className="text-xs whitespace-nowrap">{item.kindLabel}</td>
                      <td className="text-xs whitespace-nowrap">{item.startAtText}</td>
                      <td className="text-xs whitespace-nowrap">{item.requesterName}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{item.vehicleNo}</td>
                      <td className="max-w-[10rem] truncate text-xs" title={item.purpose}>
                        {item.purpose}
                      </td>
                      <td>
                        <StatusBadge
                          status={item.status}
                          label={
                            item.kind === 'COMPANY_VEHICLE'
                              ? COMPANY_VEHICLE_STATUS_LABEL[item.status]
                              : undefined
                          }
                        />
                      </td>
                    </ClickableTableRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="card">
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
            <li>
              • 법인차량은 운행 신청 가능 시간(
              {settings.companyVehicleOperatingStartTime}~
              {settings.companyVehicleOperatingEndTime}) 내에서 1회 최대{' '}
              {settings.companyVehicleMaxUsageHours}시간까지 사용할 수 있습니다.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function CarIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 16.5V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M5 11h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={8} r={3.5} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x={5} y={3.5} width={10} height={17} rx={1} stroke="currentColor" strokeWidth={1.8} />
      <path d="M15 10.5h4v10h-4" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}
