'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { REQUESTER_TYPE_LABEL, RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { apiRequest } from '@/lib/client/api-client';

type ReservationResult = {
  reservationId: number;
  reservationNo: string;
  requesterName: string;
  vehicleNo: string;
  requesterType: keyof typeof REQUESTER_TYPE_LABEL;
  reservationStatus: keyof typeof RESERVATION_STATUS_LABEL;
};

type VehicleTripResult = {
  tripId: number;
  tripNo: string | null;
  tripStatus: keyof typeof RESERVATION_STATUS_LABEL;
  employeeName: string;
  vehicleNo: string | null;
};

/**
 * 관리자 대시보드 상단바 통합 검색. 예약(방문·직원)과 법인차량 운행 신청은 서로 다른 테이블·
 * 상세 화면이라(`/admin/reservations/[id]` vs `/admin/company-vehicles/trips/[id]`) 입력하는
 * 동안 두 종류를 함께 찾아 그룹으로 나눠 보여주고, 고르면 해당 상세로 이동한다.
 * `EmployeeSearchSelect`(src/components/reservation/employee-search-select.tsx)와 같은
 * 디바운스·바깥 클릭 처리 구조를 쓴다.
 */
export function AdminGlobalSearch({ forceIcon }: { forceIcon: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState<ReservationResult[]>([]);
  const [vehicleTrips, setVehicleTrips] = useState<VehicleTripResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await apiRequest<{
        reservations: ReservationResult[];
        vehicleTrips: VehicleTripResult[];
      }>('/api/admin/search', { method: 'POST', body: JSON.stringify({ query: trimmed }) });
      setLoading(false);
      if (!response.ok) {
        setReservations([]);
        setVehicleTrips([]);
        return;
      }
      setReservations(response.data.reservations);
      setVehicleTrips(response.data.vehicleTrips);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  function handleQueryChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (next.trim().length < 2) {
      setReservations([]);
      setVehicleTrips([]);
    }
  }

  function goTo(path: string) {
    router.push(path);
    setQuery('');
    setOpen(false);
    setReservations([]);
    setVehicleTrips([]);
  }

  const trimmed = query.trim();
  const noResults =
    trimmed.length >= 2 && !loading && reservations.length === 0 && vehicleTrips.length === 0;
  // forceIcon(부모가 "직원 홈" 버튼과 겹칠 만큼 좁다고 판단한 경우)이면 포커스·입력값과
  // 무관하게 평소엔 아이콘만 보인다 — 다만 실제로 탭해서 쓰는 동안(포커스·입력 중)에는
  // 검색 기능 자체는 계속 넓혀서 쓸 수 있게 둔다(겹침보다 "기능 유지"가 우선).
  const wantsExpanded = focused || trimmed !== '';
  const expanded = forceIcon ? wantsExpanded : true;

  return (
    <div className="relative flex justify-center" ref={containerRef}>
      {/*
        드롭다운을 이 안(입력창과 같은 relative 기준)에 두어야 항상 입력창 "바로 아래"에
        붙는다. 바깥쪽(flex justify-center) 컨테이너에 같이 두면 absolute 요소의 시작
        위치가 입력창과 겹치는 경우가 있었다.
      */}
      <div className="relative">
        <SearchIcon
          className={`pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 transition-colors ${
            focused || trimmed !== '' ? 'text-brand-700' : 'text-ink-faint'
          }`}
        />
        <input
          type="search"
          className={`bg-surface-hover text-ink placeholder:text-ink-faint h-9 rounded-full border border-transparent pl-8 text-sm shadow-sm transition-[width,background-color,border-color] duration-150 outline-none focus:border-brand-500 focus:bg-surface focus:ring-2 focus:ring-brand-200 ${
            expanded ? 'w-56 pr-3' : 'w-9 pr-0'
          }`}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
          }}
          placeholder="검색어를 입력하세요"
          aria-label="예약자명·차량번호·예약번호로 예약·법인차량 운행 신청 검색"
          autoComplete="off"
        />
        {open && trimmed !== '' && (
          <div className="border-line bg-surface absolute top-full left-0 z-10 mt-1 max-h-96 w-56 overflow-y-auto rounded-xl border shadow-lg">
            {trimmed.length < 2 ? (
              <p className="text-ink-faint p-3 text-sm">2자 이상 입력해 주세요.</p>
            ) : loading ? (
              <p className="text-ink-faint p-3 text-sm">검색 중…</p>
            ) : noResults ? (
              <p className="text-ink-faint p-3 text-sm">일치하는 결과가 없습니다.</p>
            ) : (
              <>
                {reservations.length > 0 && (
                  <div>
                    <p className="bg-surface-hover text-ink-faint px-3 py-1.5 text-xs font-bold">
                      방문 예약 신청
                    </p>
                    <ul>
                      {reservations.map((reservation) => (
                        <li key={reservation.reservationId}>
                          <button
                            type="button"
                            className="hover:bg-surface-hover w-full px-3 py-2 text-left text-sm transition-colors"
                            onClick={() => goTo(`/admin/reservations/${reservation.reservationId}`)}
                          >
                            <span className="text-ink font-semibold">
                              {reservation.requesterName}
                            </span>
                            <span className="text-ink-faint ml-1 text-xs">
                              {reservation.vehicleNo} ·{' '}
                              {REQUESTER_TYPE_LABEL[reservation.requesterType]} ·{' '}
                              {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
                            </span>
                            <span className="text-ink-faint block text-xs">
                              {reservation.reservationNo}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {vehicleTrips.length > 0 && (
                  <div>
                    <p className="bg-surface-hover text-ink-faint px-3 py-1.5 text-xs font-bold">
                      법인차량 운행 신청
                    </p>
                    <ul>
                      {vehicleTrips.map((trip) => (
                        <li key={trip.tripId}>
                          <button
                            type="button"
                            className="hover:bg-surface-hover w-full px-3 py-2 text-left text-sm transition-colors"
                            onClick={() => goTo(`/admin/company-vehicles/trips/${trip.tripId}`)}
                          >
                            <span className="text-ink font-semibold">{trip.employeeName}</span>
                            <span className="text-ink-faint ml-1 text-xs">
                              {trip.vehicleNo ?? '-'} · {RESERVATION_STATUS_LABEL[trip.tripStatus]}
                            </span>
                            {trip.tripNo && (
                              <span className="text-ink-faint block text-xs">{trip.tripNo}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={2} />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
