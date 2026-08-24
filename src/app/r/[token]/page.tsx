import type { Metadata } from 'next';
import Link from 'next/link';

import { ParkingMap } from '@/components/parking-map';
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
 * 보안 토큰 기반 예약 조회 화면.
 *
 * 토큰이 만들어지는 경로는 두 가지다.
 *  1) 안내 메일에 포함된 링크 (방문 종료 + 7일까지 유효)
 *  2) 예약번호 조회 성공 시 발급 (2시간만 유효)
 *
 * 토큰 1개는 예약 1건에만 매핑되므로 다른 예약자 정보는 노출되지 않는다.
 */
export default async function ReservationAccessPage({ params }: PageProps) {
  const { token } = await params;

  let resolvedReservationId: number;
  try {
    const resolved = await resolveAccessToken(token);
    resolvedReservationId = resolved.reservationId;
  } catch {
    return <InvalidTokenView />;
  }

  const [reservation, settings] = await Promise.all([
    getReservationForRequester(resolvedReservationId),
    getSystemSettings(),
  ]);

  const view = toRequesterReservationView(reservation);

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
        initialReservation={view}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          maxReservationHours: settings.maxReservationHours,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
        }}
      />

      {/*
        배정 코드만으로는 현장에서 자리를 찾기 어려우므로 평면도에 위치를 표시한다.
        다른 예약자의 이용 현황은 그리지 않는다.
      */}
      {settings.spaceAssignmentEnabled && view.assignedSpaceCode && (
        <section className="card mt-4">
          <div className="card-body">
            <h2 className="card-title">주차 위치 안내</h2>
            <p className="field-hint">
              배정된 <strong>{view.assignedSpaceCode}</strong> 위치입니다. 차량 출입구로 들어와
              표시된 자리에 주차해 주세요.
            </p>
            <div className="mt-3">
              <ParkingMap highlightCode={view.assignedSpaceCode} />
            </div>
          </div>
        </section>
      )}
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
