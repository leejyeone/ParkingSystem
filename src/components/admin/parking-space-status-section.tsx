import Link from 'next/link';

import { COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE } from '@/domain/reservation-status';
import { formatKstTime } from '@/lib/datetime';
import type { SpaceOccupancyStatus, SpaceStatusRow } from '@/services/dashboard-service';
import { CompanyVehicleBadge, SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';

const SPACE_STATUS_LABEL: Record<SpaceOccupancyStatus, string> = {
  EMPTY: '비어 있음',
  RESERVED: '예약',
  IN_USE: '사용 중',
};

const SPACE_STATUS_CLASS: Record<SpaceOccupancyStatus, string> = {
  EMPTY: 'bg-surface-hover text-ink-faint',
  RESERVED: 'bg-amber-100 text-amber-800',
  IN_USE: 'bg-emerald-100 text-emerald-800',
};

/**
 * "주차면 현황" 표 — 대시보드(`/admin`)와 상시 모니터용 주차 평면도(`/admin/parking-map`)
 * 양쪽에서 완전히 같은 표를 쓴다.
 *
 * 법인 차량 전용 주차면은 방문 예약(occupancies)이 없는 게 정상이라, 있으면 그대로 보여주고
 * 없으면 그 차량의 운행 신청(companyVehicleTrips)을 방문 예약과 같은 모양(시간대 + 상태 배지)
 * 으로 보여준다 — 방문 예약도 운행 신청도 없으면 그제서야 "법인차량 배정"만 남는다.
 */
export function ParkingSpaceStatusSection({
  spaces,
  nowMs,
}: {
  spaces: SpaceStatusRow[];
  nowMs: number;
}) {
  return (
    <section className="card">
      <div className="card-body">
        <h2 className="card-title">
          주차면 현황
          <span className="text-ink-faint ml-2 text-xs font-bold">
            {spaces.filter((space) => space.status === 'IN_USE').length}면 사용 중
          </span>
        </h2>
        <p className="field-hint">입차 예정: 입차 처리 미완료, 사용 중: 입차 처리 완료</p>

        <div className="table-scroll mt-3">
          {/*
            table-fixed 로 두는 이유.

            기본값인 auto 레이아웃에서 `width` 는 강제가 아니라 선호값이다. 표가 내용보다
            넓으면 브라우저가 재량껏 열을 늘리는데, 그 방식이 엔진마다 달라 Safari 에서는
            폭을 지정한 유형 열까지 같이 늘어났다.
            fixed 레이아웃은 첫 행에 지정한 폭을 그대로 따르므로 엔진이 달라도 같아진다.

            주차면·유형은 내용이 짧아 고정 폭(`B1-01`, `사용불가` 기준)으로 두고,
            남는 폭은 정보가 많은 상태·상세가 절반씩 나눠 갖는다.
          */}
          <table className="data-table table-fixed">
            <thead>
              <tr>
                <th className="w-24">주차면</th>
                <th className="w-24">유형</th>
                <th className="w-1/2">상태</th>
                <th className="w-1/2">상세</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((space) => (
                <SpaceRow key={space.spaceId} space={space} nowMs={nowMs} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SpaceRow({ space, nowMs }: { space: SpaceStatusRow; nowMs: number }) {
  const hasOccupancies = space.occupancies.length > 0;
  const hasCompanyVehicleTrips = space.companyVehicleTrips.length > 0;

  return (
    <tr>
      <td className="font-mono font-bold">{space.spaceCode}</td>
      <td>
        {space.companyVehicle ? (
          <CompanyVehicleBadge />
        ) : (
          <SpaceTypeBadge spaceType={space.spaceType} />
        )}
      </td>
      {/*
        상태 열과 상세 열은 같은 목록(방문 예약 또는 법인차량 운행 신청)을 행 단위로
        나란히 보여준다. (상태 = 시간대, 상세 = 그 건의 차량번호)
      */}
      <td>
        {hasOccupancies ? (
          <ul className="space-y-1">
            {space.occupancies.map((occupancy) => (
              <li
                key={occupancy.reservationId}
                className="flex items-center gap-2 text-xs whitespace-nowrap"
              >
                <Link
                  href={`/admin/reservations/${occupancy.reservationId}`}
                  className="text-brand-700 font-bold hover:underline"
                >
                  {formatKstTime(occupancy.visitStartAt)} ~ {formatKstTime(occupancy.visitEndAt)}
                </Link>
                {space.inUseReservationId === occupancy.reservationId ? (
                  <span className={`badge ${SPACE_STATUS_CLASS.IN_USE}`}>
                    {SPACE_STATUS_LABEL.IN_USE}
                  </span>
                ) : (
                  occupancy.reservationStatus === 'APPROVED' &&
                  occupancy.visitStartAt.getTime() <= nowMs && (
                    <span className="badge bg-amber-100 text-amber-800">입차 예정</span>
                  )
                )}
              </li>
            ))}
          </ul>
        ) : hasCompanyVehicleTrips ? (
          <ul className="space-y-1">
            {space.companyVehicleTrips.map((trip) => (
              <li key={trip.tripId} className="flex items-center gap-2 text-xs whitespace-nowrap">
                <Link
                  href={`/admin/company-vehicles/trips/${trip.tripId}`}
                  className="text-brand-700 font-bold hover:underline"
                >
                  {formatKstTime(trip.requestStartAt)} ~ {formatKstTime(trip.requestEndAt)}
                </Link>
                <StatusBadge
                  status={trip.tripStatus}
                  label={COMPANY_VEHICLE_STATUS_LABEL_OVERRIDE[trip.tripStatus]}
                />
              </li>
            ))}
          </ul>
        ) : space.companyVehicle ? (
          <span className="badge bg-violet-100 text-violet-800">법인차량 배정</span>
        ) : (
          <span className={`badge ${SPACE_STATUS_CLASS.EMPTY}`}>{SPACE_STATUS_LABEL.EMPTY}</span>
        )}
      </td>
      <td>
        {hasOccupancies ? (
          <ul className="space-y-1">
            {space.occupancies.map((occupancy) => (
              <li key={occupancy.reservationId} className="text-xs">
                <Link
                  href={`/admin/reservations/${occupancy.reservationId}`}
                  className="text-brand-700 font-mono font-bold hover:underline"
                >
                  {occupancy.vehicleNo}
                </Link>
              </li>
            ))}
          </ul>
        ) : hasCompanyVehicleTrips ? (
          <ul className="space-y-1">
            {space.companyVehicleTrips.map((trip) => (
              <li key={trip.tripId} className="font-mono text-xs font-bold text-violet-800">
                {space.companyVehicle?.vehicleNo}
              </li>
            ))}
          </ul>
        ) : space.companyVehicle ? (
          <span className="font-mono text-xs font-bold text-violet-800">
            {space.companyVehicle.vehicleNo}
          </span>
        ) : (
          <span className="text-ink-faint text-xs">-</span>
        )}
      </td>
    </tr>
  );
}
