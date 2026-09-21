'use client';

import { useState } from 'react';

type Vehicle = { vehicleId: number; vehicleNo: string; isActive: boolean };

type Props = {
  vehicles: Vehicle[];
  vehicleId: number;
  /** 지금 적용된 날짜/정렬 등 다른 조건 — 차량만 바꾸고 나머지는 그대로 유지한다. */
  hiddenFields: Record<string, string>;
};

/**
 * "선택된 차량 정보" 카드 우상단의 차량 변경 아이콘 버튼 — 누르면 그 자리에 드롭다운이
 * 펼쳐진다. 카드 자체의 표시 스타일(차량번호 제목 + 배지 + 배정 위치)은 손대지 않고,
 * 차량을 바꾸는 조작만 이 작은 팝오버 안에 둔다.
 */
export function CompanyVehicleLogSwitcher({ vehicles, vehicleId, hiddenFields }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={open}
        aria-label="차량 변경"
        onClick={() => setOpen((previous) => !previous)}
      >
        <SwitchIcon />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          />
          <form
            method="get"
            className="border-line-muted bg-surface absolute top-full right-0 z-20 mt-2 flex items-center gap-2 rounded-lg border p-2 shadow-lg"
          >
            {Object.entries(hiddenFields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <select
              name="vehicleId"
              defaultValue={vehicleId}
              required
              autoFocus
              className="input min-w-32"
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                  {vehicle.vehicleNo}
                  {!vehicle.isActive && ' (비활성)'}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary btn-sm whitespace-nowrap">
              이동
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function SwitchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h13.5M17.5 8 14 4.5M20 16H6.5M6.5 16 10 19.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
