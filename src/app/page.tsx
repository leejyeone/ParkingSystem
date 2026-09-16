import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { ActionCard } from '@/components/ui/action-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { formatKstDateTime } from '@/lib/datetime';
import { getUserSession } from '@/lib/user-session';
import { listReservationsForUser } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

const RECENT_RESERVATIONS_LIMIT = 3;

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 메인 화면. 모바일에서 버튼을 크고 명확하게 노출한다. */
export default async function HomePage({ searchParams }: PageProps) {
  // 사내망 "다른 사이트 로그인 연동"이 루트에 착지한다(대소문자 표기가 시스템마다 다를 수
  // 있어 대소문자 구분 없이 찾는다). 발견하면 실제 세션 발급 로직(`GET /api/employee/enter`)
  // 으로 그대로 넘긴다 — 로직을 여기서 중복하지 않는다.
  //
  //   `/?email=메일`     그룹웨어 SYSMAIL 로 진입 (권장 — 그룹웨어에서 유일한 값이다)
  //   `/?fsacode=사번`   사번으로 진입 (기존 방식. 사번이 없거나 중복인 직원은 못 쓴다)
  //
  // `k` 는 그룹웨어 메뉴에만 넣어 둔 공유 비밀값이다. 있으면 그대로 넘겨준다.
  // redirect 를 따로 지정하지 않으면 `safeEmployeeRedirect` 기본값인 `/employee` 로 간다.
  const params = await searchParams;
  const pick = (name: string): string | undefined => {
    const key = Object.keys(params).find((k) => k.toLowerCase() === name);
    const raw = key ? params[key] : undefined;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() || undefined;
  };

  const entryKey = pick('k');
  const keyParam = entryKey ? `&k=${encodeURIComponent(entryKey)}` : '';
  const email = pick('email');
  const fsacode = pick('fsacode');

  if (email) {
    redirect(`/api/employee/enter?email=${encodeURIComponent(email)}${keyParam}`);
  }
  if (fsacode) {
    redirect(`/api/employee/enter?empId=${encodeURIComponent(fsacode)}${keyParam}`);
  }

  const [settings, session] = await Promise.all([
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
    getUserSession(),
  ]);

  const recentReservations = session
    ? await listReservationsForUser(session.userId, {
        page: 1,
        pageSize: RECENT_RESERVATIONS_LIMIT,
        entryExitManagementEnabled: settings.entryExitManagementEnabled,
        // "최근 예약 현황" 이라는 이름에 맞게, 예정 여부와 무관하게 최근에 신청한
        // 순(order 기본값 'desc')으로 보여준다 — 지난 방문도 여기 보인다.
      })
    : null;

  return (
    <main className="app-container-medium">
      {!session && (
        <header className="mt-6 mb-6 text-center">
          <div className="mt-3 flex justify-center">
            <Image src="/synopex-logo.png" alt="Synopex" width={175} height={50} priority />
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">시노펙스 방문 예약</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            시노펙스 동탄 사업장의 방문을 신청할 수 있습니다.
          </p>
        </header>
      )}

      {session ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            href="/reservations/new"
            icon={<CarIcon />}
            title="방문 신청"
            description="본인 차량으로 방문 시 신청합니다."
          />
          <ActionCard
            href="/mypage/reservations"
            icon={<ListIcon />}
            title="예약 조회"
            description="신청한 방문 예약을 확인합니다."
          />
          <ActionCard
            href="/mypage"
            icon={<PersonIcon />}
            title="마이페이지"
            description="내 정보와 회원 설정을 관리합니다."
          />
        </div>
      ) : (
        // 방문 신청은 로그인이 필수라, 비로그인 사용자에게는 로그인/회원가입만 보여준다.
        <nav className="grid gap-3">
          <Link href="/login" className="btn btn-primary btn-lg w-full">
            로그인
          </Link>
          <Link href="/signup" className="btn btn-primary btn-lg w-full">
            회원가입
          </Link>
        </nav>
      )}

      {session && recentReservations && (
        <section className="card mt-6">
          <div className="card-body">
            <div className="flex items-center justify-between gap-2">
              <h2 className="card-title">최근 예약 현황</h2>
              <Link href="/mypage/reservations" className="text-brand-700 text-xs font-bold">
                전체보기
              </Link>
            </div>

            {recentReservations.items.length === 0 ? (
              <p className="text-ink-faint mt-3 text-sm">신청 내역이 없습니다.</p>
            ) : (
              <div className="table-scroll mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>방문일시</th>
                      <th>성명</th>
                      <th>차량번호</th>
                      <th>담당자</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReservations.items.map((reservation) => (
                      <ClickableTableRow
                        key={reservation.reservationId}
                        href={`/mypage/reservations/${reservation.reservationId}`}
                      >
                        <td className="text-xs whitespace-nowrap">
                          {formatKstDateTime(reservation.visitStartAt)}
                        </td>
                        <td className="text-xs">{reservation.requesterName}</td>
                        <td className="font-mono text-xs whitespace-nowrap">
                          {reservation.vehicleNo}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {reservation.employeeUserName ?? '-'}
                        </td>
                        <td>
                          <StatusBadge status={reservation.displayStatus} />
                        </td>
                      </ClickableTableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

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
                ? '• 주차 위치는 관리자가 배정합니다.'
                : '• 주차 위치는 지정되지 않습니다. 승인 후 현장 안내에 따라 주차해 주세요.'}
            </li>
            <li>• 신청 결과는 입력하신 이메일로도 발송됩니다.</li>
            <li>• 방문 신청은 회원가입 후 로그인해야 이용할 수 있습니다.</li>
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

function ListIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h11M8 12h11M8 18h11"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx={4} cy={6} r={1.3} fill="currentColor" />
      <circle cx={4} cy={12} r={1.3} fill="currentColor" />
      <circle cx={4} cy={18} r={1.3} fill="currentColor" />
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
