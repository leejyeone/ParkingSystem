'use client';

import { useState } from 'react';

import { ParkingMap } from '@/components/parking-map';
import { LAYOUTS_BY_AREA_CODE } from '@/domain/parking-map-layout';
import type { SpaceStatusRow } from '@/services/dashboard-service';

type AreaGroup = {
  areaId: number;
  areaCode: string;
  areaName: string;
  spaces: SpaceStatusRow[];
};

/** 관리자 대시보드 "주차 평면도" 카드 — 구역(지하 1층/지상 1층)을 탭으로 오간다. */
export function ParkingFloorTabs({ areas }: { areas: AreaGroup[] }) {
  const [selectedAreaId, setSelectedAreaId] = useState(areas[0]?.areaId ?? null);
  const selected = areas.find((area) => area.areaId === selectedAreaId) ?? areas[0];

  if (!selected) return null;

  const layout = LAYOUTS_BY_AREA_CODE[selected.areaCode];

  return (
    <div>
      {areas.length > 1 && (
        <nav className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {areas.map((area) => (
            <button
              key={area.areaId}
              type="button"
              onClick={() => setSelectedAreaId(area.areaId)}
              className={`rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                area.areaId === selected.areaId
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {area.areaName}
            </button>
          ))}
        </nav>
      )}

      {layout ? (
        <ParkingMap spaces={selected.spaces} layout={layout} />
      ) : (
        <p className="text-sm text-slate-500">이 구역은 아직 평면도가 없습니다.</p>
      )}
    </div>
  );
}
