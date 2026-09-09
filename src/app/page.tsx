import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserLogoutButton } from '@/components/user/user-logout-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { formatKstDate, formatKstRange, kstDayRangeUtc } from '@/lib/datetime';
import { getUserSession } from '@/lib/user-session';
import { listReservationsForUser } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile } from '@/services/user-auth-service';

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

  const [profile, recentReservations] = session
    ? await Promise.all([
        getUserProfile(session.userId),
        listReservationsForUser(session.userId, {
          page: 1,
          pageSize: RECENT_RESERVATIONS_LIMIT,
          entryExitManagementEnabled: settings.entryExitManagementEnabled,
          // 오늘(KST 00:00) 이후 예약만 — 지난 방문 이력은 마이페이지에서 본다.
          fromDate: kstDayRangeUtc(formatKstDate(new Date())).start,
          order: 'asc',
        }),
      ])
    : [null, null];

  return (
    <main className="app-container">
      {session && (
        <div className="flex items-center justify-end gap-3">
          <div className="text-right">
            <span className="block text-sm font-bold whitespace-nowrap text-slate-900">
              {profile?.name ?? session.name}
            </span>
            {profile?.companyOrBranchName && (
              <span className="block text-xs whitespace-nowrap text-slate-500">
                {profile.companyOrBranchName}
              </span>
            )}
          </div>
          <Link
            href="/mypage"
            className="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold whitespace-nowrap text-sky-600 transition hover:bg-sky-100"
          >
            MY
          </Link>
          <UserLogoutButton />
        </div>
      )}

      <header className={`mb-6 text-center ${session ? 'mt-3' : 'mt-6'}`}>

        <div className="mt-3 flex justify-center">
          <Image src="/synopex-logo.png" alt="Synopex" width={175} height={50} priority />
        </div>
        <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">시노펙스 방문 예약</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          시노펙스 동탄 사업장의 방문을 신청할 수 있습니다.
        </p>
      </header>

      <nav className="grid gap-3">
        <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
          방문 신청하기
        </Link>
        {/* 로그인하면 우상단 MY 버튼에서 내 예약을 바로 볼 수 있으므로 예약번호 조회는 감춘다. */}
        {!session && (
          <>
            <Link href="/reservations/lookup" className="btn btn-secondary btn-lg w-full">
              내 예약 조회하기
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/login" className="btn btn-secondary w-full">
                로그인
              </Link>
              <Link href="/signup" className="btn btn-secondary w-full">
                회원가입
              </Link>
            </div>
          </>
        )}
      </nav>

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
              <ul className="mt-3 space-y-2">
                {recentReservations.items.map((reservation) => (
                  <li key={reservation.reservationId}>
                    <Link
                      href={`/mypage/reservations/${reservation.reservationId}`}
                      className="hover:border-brand-500 border-line hover:bg-surface-hover flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 transition"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-ink text-sm font-bold">
                            {reservation.companyOrBranchName}
                          </span>
                          <span className="text-ink-muted text-sm">
                            {reservation.requesterName}
                          </span>
                        </div>
                        <p className="text-ink-faint mt-1 text-xs">
                          {formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}
                          {reservation.employeeUserName && (
                            <> · 시노펙스 담당자: {reservation.employeeUserName}</>
                          )}
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
                ? '• 주차 위치는 관리자가 배정합니다. 직접 선택할 수 없습니다.'
                : '• 주차 위치는 지정되지 않습니다. 승인 후 현장 안내에 따라 주차해 주세요.'}
            </li>
            <li>• 신청 결과와 예약 조회 링크는 입력하신 이메일로 발송됩니다.</li>
            <li>• 예약 조회는 성명·차량번호로 하거나, 안내 메일의 링크를 이용하면 됩니다.</li>
            <li>• 로그인하면 신청 시 내 정보가 자동으로 입력됩니다. (선택 사항)</li>
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
