import Link from 'next/link';

import {
  MAP_BUILDING,
  MAP_ELEVATOR,
  MAP_ENTRANCE,
  MAP_ROOMS,
  MAP_STALLS,
} from '@/domain/parking-map-layout';
import { formatKstTime } from '@/lib/datetime';
import type { SpaceStatusRow } from '@/services/dashboard-service';

/**
 * 주차 평면도.
 *
 * 업로드한 그림을 띄우는 대신 도면 좌표(parking-map-layout)에 상태를 겹쳐 그린다.
 * 쓰임새가 둘이라 표시 방식이 갈린다.
 *
 * 1) 관리자 대시보드 — `spaces` 를 넘긴다. 선택한 날짜의 현황이 색으로 드러난다.
 *      진회색 = 비활성 / 노란색 = 사용 가능 / 초록색 = 예약 있음·사용 중
 *
 * 2) 신청자 예약 조회 — `highlightCode` 만 넘긴다. **다른 예약자의 정보는 그리지 않고**
 *    본인에게 배정된 한 면만 강조한다. 코드(B1-02)만 알려주면 현장에서 찾기 어렵기 때문이다.
 *
 * viewBox 만 지정하고 width 를 지정하지 않아 컨테이너 폭에 맞춰 늘어난다.
 */

/** 1 SVG unit = 0.1 m */
const U = 10;
const u = (meters: number) => Math.round(meters * U * 10) / 10;

type StallStyle = { fill: string; stroke: string; text: string };

const AVAILABLE: StallStyle = { fill: '#fef9c3', stroke: '#a16207', text: '#713f12' };
const OCCUPIED: StallStyle = { fill: '#86efac', stroke: '#15803d', text: '#14532d' };
const DISABLED: StallStyle = { fill: '#64748b', stroke: '#334155', text: '#f1f5f9' };
/** DB 에 없는 코드가 도면에 있을 때 (배치와 등록이 어긋난 상태) */
const UNKNOWN: StallStyle = { fill: '#ffffff', stroke: '#cbd5e1', text: '#94a3b8' };
/** 신청자 화면에서 본인 자리가 아닌 주차면 */
const NEUTRAL: StallStyle = { fill: '#f8fafc', stroke: '#cbd5e1', text: '#cbd5e1' };
/** 신청자 화면에서 본인에게 배정된 자리 */
const MINE: StallStyle = { fill: '#22c55e', stroke: '#15803d', text: '#ffffff' };

function styleFor(space: SpaceStatusRow | undefined): StallStyle {
  if (!space) return UNKNOWN;
  if (!space.isActive) return DISABLED;
  return space.status === 'EMPTY' ? AVAILABLE : OCCUPIED;
}

/** 마우스를 올렸을 때 나오는 설명 */
function tooltipFor(code: string, space: SpaceStatusRow | undefined): string {
  if (!space) return `${code} — 등록되지 않은 주차면`;
  if (!space.isActive) return `${code} — 비활성`;
  if (space.occupancies.length === 0) return `${code} — 사용 가능`;

  const lines = space.occupancies.map((occupancy) => {
    const range = `${formatKstTime(occupancy.visitStartAt)}~${formatKstTime(occupancy.visitEndAt)}`;
    const mark = occupancy.reservationId === space.inUseReservationId ? ' (사용 중)' : '';
    return `${range} ${occupancy.vehicleNo}${mark}`;
  });
  return `${code}\n${lines.join('\n')}`;
}

type Props =
  /** 관리자 대시보드: 주차면 상태를 색으로 표시한다. */
  | { spaces: SpaceStatusRow[]; highlightCode?: undefined }
  /** 신청자 화면: 배정된 한 면만 강조하고 나머지는 회색으로 둔다. */
  | { spaces?: undefined; highlightCode: string | null };

export function ParkingMap({ spaces, highlightCode }: Props) {
  const byCode = new Map((spaces ?? []).map((space) => [space.spaceCode, space]));
  const requesterView = spaces === undefined;

  /*
   * 도면은 이 사업장 배치에 맞춰 그려져 있다. 표시할 주차면이 도면과 하나도 맞지 않으면
   * (다른 주차장을 운영하는 경우) 빈 도면을 띄우는 대신 아무것도 그리지 않는다.
   */
  const matches = requesterView
    ? MAP_STALLS.some((stall) => stall.code === highlightCode)
    : MAP_STALLS.some((stall) => byCode.has(stall.code));
  if (!matches) return null;

  const counts = { available: 0, occupied: 0, disabled: 0 };
  for (const stall of MAP_STALLS) {
    const space = byCode.get(stall.code);
    if (!space) continue;
    if (!space.isActive) counts.disabled += 1;
    else if (space.status === 'EMPTY') counts.available += 1;
    else counts.occupied += 1;
  }

  const entranceW = MAP_ENTRANCE.xOut - MAP_BUILDING.w;
  // 진입 방향 화살표는 출입구 박스 위쪽에 둔다.
  const arrowY = u(MAP_ENTRANCE.yTop - 1.8);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {requesterView ? (
          <Legend color={MINE} label={`내 주차 위치 ${highlightCode}`} />
        ) : (
          <>
            <Legend color={AVAILABLE} label={`사용 가능 ${counts.available}면`} />
            <Legend color={OCCUPIED} label={`예약·사용 중 ${counts.occupied}면`} />
            <Legend color={DISABLED} label={`비활성 ${counts.disabled}면`} />
          </>
        )}
      </div>

      {/*
        표는 가로 스크롤이 생기지만 도면은 폭에 맞춰 줄이는 편이 읽기 좋다.
        preserveAspectRatio 기본값(비율 유지)을 그대로 쓴다.
      */}
      <svg
        viewBox={`-8 -8 ${u(MAP_ENTRANCE.xOut) + 16} ${u(MAP_BUILDING.h) + 16}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          requesterView
            ? `주차 평면도. 배정된 주차 위치는 ${highlightCode} 입니다.`
            : `주차 평면도. 사용 가능 ${counts.available}면, 예약·사용 중 ${counts.occupied}면, 비활성 ${counts.disabled}면.`
        }
      >
        {MAP_ROOMS.map((room) => (
          <rect
            key={`${room.x}-${room.y}`}
            x={u(room.x)}
            y={u(room.y)}
            width={u(room.w)}
            height={u(room.h)}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
        ))}

        <rect
          x={u(MAP_ELEVATOR.x)}
          y={u(MAP_ELEVATOR.y)}
          width={u(MAP_ELEVATOR.w)}
          height={u(MAP_ELEVATOR.h)}
          fill="#3b82f6"
          stroke="#1d4ed8"
          strokeWidth={2}
        />
        <text
          x={u(MAP_ELEVATOR.x + MAP_ELEVATOR.w / 2)}
          y={u(MAP_ELEVATOR.y + MAP_ELEVATOR.h / 2) + 5}
          fontSize={13}
          fontWeight={700}
          fill="#ffffff"
          textAnchor="middle"
        >
          엘리베이터
        </text>

        <rect
          x={u(MAP_BUILDING.w)}
          y={u(MAP_ENTRANCE.yTop)}
          width={u(entranceW)}
          height={u(MAP_ENTRANCE.yBottom - MAP_ENTRANCE.yTop)}
          fill="#dbeafe"
          stroke="#2563eb"
          strokeWidth={3}
        />
        <text
          x={u((MAP_BUILDING.w + MAP_ENTRANCE.xOut) / 2)}
          y={u((MAP_ENTRANCE.yTop + MAP_ENTRANCE.yBottom) / 2) + 6}
          fontSize={16}
          fontWeight={700}
          fill="#1d4ed8"
          textAnchor="middle"
        >
          차량 출입구
        </text>
        <path
          d={`M ${u(MAP_ENTRANCE.xOut)} ${arrowY} L ${u(MAP_BUILDING.w) + 24} ${arrowY}`}
          stroke="#1d4ed8"
          strokeWidth={9}
          fill="none"
        />
        <path d={`M ${u(MAP_BUILDING.w) + 2} ${arrowY} l 24 -12 l 0 24 Z`} fill="#1d4ed8" />

        <rect
          x={0}
          y={0}
          width={u(MAP_BUILDING.w)}
          height={u(MAP_BUILDING.h)}
          fill="none"
          stroke="#0f172a"
          strokeWidth={4}
        />

        {MAP_STALLS.map((stall) => {
          const space = byCode.get(stall.code);
          const mine = requesterView && stall.code === highlightCode;
          const style = requesterView ? (mine ? MINE : NEUTRAL) : styleFor(space);
          const cx = u(stall.x + stall.w / 2);
          const cy = u(stall.y + stall.h / 2) + 3.5;
          const label = (
            <>
              <rect
                x={u(stall.x)}
                y={u(stall.y)}
                width={u(stall.w)}
                height={u(stall.h)}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={mine ? 3 : 1.2}
              />
              <text
                x={cx}
                y={cy}
                fontSize={9.5}
                fontWeight={700}
                fill={style.text}
                textAnchor="middle"
                transform={stall.rotated ? undefined : `rotate(-90 ${cx} ${cy})`}
              >
                {stall.code}
              </text>
              {/* 신청자 화면에서는 다른 예약자의 정보를 툴팁으로도 노출하지 않는다. */}
              {!requesterView && <title>{tooltipFor(stall.code, space)}</title>}
            </>
          );

          if (requesterView) {
            return <g key={stall.code}>{label}</g>;
          }

          // 예약이 있으면 눌러서 해당 예약 상세로 넘어갈 수 있게 한다.
          const reservationId = space?.occupancies[0]?.reservationId;
          return reservationId ? (
            <Link key={stall.code} href={`/admin/reservations/${reservationId}`}>
              {label}
            </Link>
          ) : (
            <g key={stall.code}>{label}</g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: StallStyle; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-5 rounded-sm border"
        style={{ backgroundColor: color.fill, borderColor: color.stroke }}
      />
      <span className="text-slate-600">{label}</span>
    </span>
  );
}
