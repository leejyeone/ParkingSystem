'use client';

import { useState } from 'react';

import { ParkingMap, type SelectableSpace } from '@/components/parking-map';
import { LAYOUTS_BY_AREA_CODE } from '@/domain/parking-map-layout';

type AreaGroup = {
  areaId: number;
  areaCode: string;
  areaName: string;
  spaces: SelectableSpace[];
};

/**
 * 관리자 예약 상세 "주차면 배정" — 주차 평면도에서 자리를 눌러 고르는 방식.
 * 구역 탭(지하 1층/지상 1층)을 오가도 선택 상태는 부모(reservation-action-panel)가
 * 들고 있으므로 그대로 유지된다.
 */
export function ParkingSpacePicker({
  areas,
  selectedSpaceId,
  onSelect,
}: {
  areas: AreaGroup[];
  selectedSpaceId: number | null;
  onSelect: (space: SelectableSpace) => void;
}) {
  const initialAreaId =
    areas.find((area) => area.spaces.some((space) => space.spaceId === selectedSpaceId))
      ?.areaId ??
    areas.find((area) => area.spaces.some((space) => space.available))?.areaId ??
    areas[0]?.areaId ??
    null;
  const [selectedAreaId, setSelectedAreaId] = useState(initialAreaId);
  const selected = areas.find((area) => area.areaId === selectedAreaId) ?? areas[0];

  if (!selected) return null;

  const layout = LAYOUTS_BY_AREA_CODE[selected.areaCode];

  return (
    <div>
      {areas.length > 1 && (
        <nav className="bg-surface-hover mb-3 flex gap-1 overflow-x-auto rounded-lg p-1">
          {areas.map((area) => (
            <button
              key={area.areaId}
              type="button"
              onClick={() => setSelectedAreaId(area.areaId)}
              className={`rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                area.areaId === selected.areaId
                  ? 'bg-brand-700 text-white'
                  : 'text-ink-muted hover:bg-surface-active'
              }`}
            >
              {area.areaName}
            </button>
          ))}
        </nav>
      )}

      {layout ? (
        <ParkingMap layout={layout} selectable={{ spaces: selected.spaces, selectedSpaceId, onSelect }} />
      ) : (
        <p className="text-ink-faint text-sm">이 구역은 아직 평면도가 없습니다.</p>
      )}
    </div>
  );
}
