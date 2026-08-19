import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserLogoutButton } from '@/components/user/user-logout-button';
import { UserProfilePanel } from '@/components/user/user-profile-panel';
import { StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import { formatKstRange } from '@/lib/datetime';
import { requireUserPage } from '@/lib/user-page-guard';
import { listReservationsForUser } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

export default async function MyPage() {
  const session = await requireUserPage('/mypage');

  const [profile, reservations, settings] = await Promise.all([
    getUserProfile(session.userId),
    listReservationsForUser(session.userId),
    getSystemSettings(),
  ]);
  const showSpace = settings.spaceAssignmentEnabled;

  if (!profile) {
    redirect('/login?redirect=%2Fmypage');
  }

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-brand-700 text-sm font-semibold">
            ← 처음으로
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
          <p className="mt-1 text-sm text-slate-600">{profile.name}님, 안녕하세요.</p>
        </div>
        <UserLogoutButton />
      </div>

      <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
        주차 신청하기
      </Link>

      <section className="card">
        <div className="card-body">
          <h2 className="card-title">내 예약 ({reservations.length}건)</h2>
          <p className="field-hint">로그인한 상태로 신청한 예약이 표시됩니다.</p>

          {reservations.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              아직 신청한 예약이 없습니다. 위 버튼으로 주차를 신청해 보세요.
            </p>
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
                    <StatusBadge status={reservation.reservationStatus} />
                  </div>
                  <dl className="mt-2 space-y-1 text-sm text-slate-700">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">방문 시간</dt>
                      <dd>{formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-xs font-bold text-slate-500">신청 구분</dt>
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
                </li>
              ))}
            </ul>
          )}

          <p className="field-hint mt-4">
            예약 수정·취소는{' '}
            <Link href="/reservations/lookup" className="text-brand-700 font-semibold">
              예약 조회
            </Link>{' '}
            화면에서 예약번호로 진행하거나, 안내 메일의 링크를 이용해 주세요.
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
