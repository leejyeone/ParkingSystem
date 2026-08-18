import type { Metadata } from 'next';
import Link from 'next/link';

import { ReservationAccessPanel } from '@/components/reservation/reservation-access-panel';
import { Alert } from '@/components/ui/alert';
import { toRequesterReservationView } from '@/lib/serializers/reservation-view';
import { resolveAccessToken } from '@/services/reservation-access-service';
import { getReservationForRequester } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '내 예약' };

type PageProps = { params: Promise<{ token: string }> };

/**
 * 이메일 보안 토큰으로만 접근 가능한 예약 조회 화면.
 *
 * - 토큰 1개는 예약 1건에만 매핑되므로 다른 예약자 정보는 노출되지 않는다.
 * - 예약번호만 입력해 조회하는 화면은 제공하지 않는다.
 */
export default async function ReservationAccessPage({ params }: PageProps) {
  const { token } = await params;

  let resolvedReservationId: number;
  try {
    const resolved = await resolveAccessToken(token, { markUsed: true });
    resolvedReservationId = resolved.reservationId;
  } catch {
    return <InvalidTokenView />;
  }

  const [reservation, settings] = await Promise.all([
    getReservationForRequester(resolvedReservationId),
    getSystemSettings(),
  ]);

  return (
    <main className="app-container">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">내 예약</h1>
        <p className="mt-1 text-sm text-slate-600">
          본인 예약 1건만 조회·수정·취소할 수 있는 보안 링크입니다. 링크를 타인과 공유하지 마세요.
        </p>
      </div>

      <ReservationAccessPanel
        token={token}
        initialReservation={toRequesterReservationView(reservation)}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          maxReservationHours: settings.maxReservationHours,
        }}
      />
    </main>
  );
}

function InvalidTokenView() {
  return (
    <main className="app-container">
      <h1 className="mb-4 text-xl font-black text-slate-900 sm:text-2xl">
        예약을 확인할 수 없습니다
      </h1>
      <div className="space-y-4">
        <Alert variant="error" title="유효하지 않거나 만료된 링크입니다">
          <p>이메일로 받으신 가장 최근 링크를 사용해 주세요.</p>
          <p className="mt-1">링크는 방문 종료일로부터 일정 기간이 지나면 자동으로 만료됩니다.</p>
        </Alert>
        <Link href="/reservations/lookup" className="btn btn-secondary w-full">
          예약 조회 방법 안내
        </Link>
        <Link href="/reservations/new" className="btn btn-primary w-full">
          새로 주차 신청하기
        </Link>
      </div>
    </main>
  );
}
