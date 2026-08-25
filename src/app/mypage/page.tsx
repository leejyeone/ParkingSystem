import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserLogoutButton } from '@/components/user/user-logout-button';
import { UserProfilePanel } from '@/components/user/user-profile-panel';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import { formatKstRange } from '@/lib/datetime';
import { requireUserPage } from '@/lib/user-page-guard';
import { listReservationsForUser } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile, linkReservationsToUser } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

type PageProps = { searchParams: Promise<{ linked?: string }> };

export default async function MyPage({ searchParams }: PageProps) {
  const session = await requireUserPage('/mypage');
  const linkedCount = Number((await searchParams).linked);

  const profile = await getUserProfile(session.userId);

  if (!profile) {
    redirect('/login?redirect=%2Fmypage');
  }

  // 로그인 세션을 유지한 채 로그아웃 상태로 신청한 예약이 있을 수 있으므로,
  // 목록을 읽기 직전에 한 번 더 연결한다. (대부분 0건이라 비용이 거의 없다)
  await linkReservationsToUser({
    userId: session.userId,
    email: profile.email,
    name: profile.name,
  });

  const settings = await getSystemSettings();
  const reservations = await listReservationsForUser(session.userId, {
    entryExitManagementEnabled: settings.entryExitManagementEnabled,
  });
  const showSpace = settings.spaceAssignmentEnabled;

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-brand-700 text-sm font-semibold">
            ← 처음으로
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile.companyOrBranchName} {profile.name}님, 안녕하세요.
          </p>
        </div>
        <UserLogoutButton />
      </div>

      <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
        방문 신청하기
      </Link>

      <section className="card">
        <div className="card-body">
          {Number.isInteger(linkedCount) && linkedCount > 0 && (
            <div className="mb-3">
              <Alert variant="success" title="기존 예약을 연결했습니다">
                가입하신 성명·이메일과 일치하는 기존 예약 {linkedCount}건을 내 예약으로
                연결했습니다.
              </Alert>
            </div>
          )}

          <h2 className="card-title">내 예약 ({reservations.length}건)</h2>
          <p className="field-hint">
            수정·취소는 승인 대기 상태에서만 가능합니다.
            <br />
            승인 완료된 예약의 변경이 필요하면 담당자에게 문의해 주세요.
          </p>

          {reservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              아직 신청한 예약이 없습니다. 위 버튼으로 방문을 신청해 보세요.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reservations.map((reservation) => (
                <li key={reservation.reservationId}>
                  {/*
                    상태와 무관하게 모두 상세로 이동할 수 있다.
                    수정·취소 가능 여부는 이동한 화면에서 판단해 안내한다.
                  */}
                  <Link
                    href={`/mypage/reservations/${reservation.reservationId}`}
                    className="hover:border-brand-500 block rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {reservation.reservationNo}
                      </span>
                      <StatusBadge status={reservation.displayStatus} />
                    </div>
                    <dl className="mt-2 space-y-1 text-sm text-slate-700">
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">
                          방문 시간
                        </dt>
                        <dd>{formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">
                          신청 구분
                        </dt>
                        <dd>{REQUESTER_TYPE_LABEL[reservation.requesterType]}</dd>
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

          <p className="field-hint mt-4">
            위 목록에 없는 예약은{' '}
            <Link href="/reservations/lookup" className="text-brand-700 font-semibold">
              예약 조회
            </Link>{' '}
            화면에서 예약번호로 확인할 수 있습니다.
          </p>
        </div>
      </section>

      <UserProfilePanel
        profile={{
          email: profile.email,
          name: profile.name,
          companyOrBranchName: profile.companyOrBranchName,
          vehicleNo: profile.vehicleNo,
        }}
      />
    </main>
  );
}
