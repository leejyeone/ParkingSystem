'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  findLayoutForStallCode,
  LAYOUTS_BY_AREA_CODE,
  type MapLayout,
} from '@/domain/parking-map-layout';
import { formatKstTime } from '@/lib/datetime';
import type { SpaceStatusRow } from '@/services/dashboard-service';

/**
 * 주차 평면도.
 *
 * 업로드한 그림을 띄우는 대신 도면 좌표(parking-map-layout)에 상태를 겹쳐 그린다.
 * 쓰임새가 둘이라 표시 방식이 갈린다.
 *
 * 1) 관리자 대시보드 — `spaces` + `layout` 을 넘긴다. 선택한 날짜의 현황이 색으로 드러난다.
 *      진회색 = 비활성 / 노란색 = 사용 가능 / 초록색 = 예약 있음·사용 중
 *    구역이 여러 개(지하 1층/지상 1층)라 어느 도면을 그릴지 호출부가 정한다.
 *
 * 2) 신청자 예약 조회 — `highlightCode` 만 넘긴다. **다른 예약자의 정보는 그리지 않고**
 *    본인에게 배정된 한 면만 강조한다. 코드(B1-02)만 알려주면 현장에서 찾기 어렵기 때문이다.
 *    이쪽은 어느 구역인지 모르므로 코드로 도면을 자동으로 찾는다.
 *
 * viewBox 만 지정하고 width 를 지정하지 않아 컨테이너 폭에 맞춰 늘어난다.
 *
 * 클라이언트 컴포넌트인 이유는 한 주차면에 예약이 여러 건일 때 고를 패널이 필요해서다.
 * 신청자 화면에서는 상호작용이 없지만, 정적인 SVG 라 전송 비용이 크지 않다.
 */

/** 1 SVG unit = 0.1 m */
const U = 10;
const u = (meters: number) => Math.round(meters * U * 10) / 10;

/**
 * 모든 층이 같은 viewBox 크기를 공유해야 "유닛 1개 = 화면 픽셀 1개" 비율이 층마다
 * 똑같아진다 — 층별로 building.w/h 에 맞춰 viewBox 를 따로 잡으면, 건물 크기가 조금만
 * 달라도(예: 지하 1층 79.35 vs 지상 1층 76) SVG 가 카드 폭에 맞춰 서로 다른 배율로
 * 늘어나면서 엘리베이터처럼 두 층에 같은 좌표로 박아 둔 요소조차 화면상 위치·크기가
 * 어긋나 보인다. 가장 큰 건물 기준으로 여백까지 포함한 크기를 한 번만 계산해 모든 층이
 * 그대로 쓴다.
 */
const SHARED_VIEWBOX_W =
  Math.max(...Object.values(LAYOUTS_BY_AREA_CODE).map((layout) => layout.building.w * 10)) + 16;
const SHARED_VIEWBOX_H =
  Math.max(...Object.values(LAYOUTS_BY_AREA_CODE).map((layout) => layout.building.h * 10)) + 16;

/** 건물 외곽선·엘리베이터·차량 출입구 화살표 — 구조물은 전부 모노톤. */
const STRUCT_FILL = '#52525b';
const STRUCT_LINE = '#27272a';
const ROOM_FILL = '#e8ebef';
const ROOM_LINE = '#b8c0cc';
const STALL_RADIUS = 4;

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

/**
 * 다각형의 모든 꼭짓점을 같은 반지름으로 둥글린 path 문자열 하나를 만든다 — 비주차
 * 개방 구역(roomShape)을 사각형 여러 개 대신 이음매 없는 도형 하나로 그리는 데 쓴다.
 */
function roundedPolygonPath(points: readonly (readonly [number, number])[], r: number): string {
  const n = points.length;
  const seg = (a: readonly [number, number], b: readonly [number, number], t: number) =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
  const dist = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);

  let d = '';
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const tIn = Math.min(r / dist(prev, curr), 0.5);
    const tOut = Math.min(r / dist(curr, next), 0.5);
    const enter = seg(curr, prev, tIn);
    const exit = seg(curr, next, tOut);
    d += i === 0 ? `M ${enter[0]} ${enter[1]} ` : `L ${enter[0]} ${enter[1]} `;
    d += `Q ${curr[0]} ${curr[1]} ${exit[0]} ${exit[1]} `;
  }
  return `${d}Z`;
}

/** 차량 출입구 사각형 안에 진입/진출 화살표 2개만 그린다(박스·라벨 없음). */
function EntranceArrows({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  const x = u(box.x);
  const y = u(box.y);
  const w = u(box.w);
  const h = u(box.h);
  const cx = x + w / 2;
  const rowH = h / 2 - 3;
  const y1 = y + rowH / 2;
  const y2 = y + h - rowH / 2;

  function arrow(cy: number, dir: 'left' | 'right') {
    const half = w / 2 - 3;
    const shaftW = 8;
    const headW = 17;
    const tailX = dir === 'left' ? cx + half : cx - half;
    const tipX = dir === 'left' ? cx - half : cx + half;
    const headBaseX = dir === 'left' ? tipX + headW : tipX - headW;
    return (
      <g key={dir}>
        <rect
          x={Math.min(tailX, headBaseX)}
          y={cy - shaftW / 2}
          width={Math.abs(headBaseX - tailX)}
          height={shaftW}
          fill={STRUCT_FILL}
        />
        <path
          d={`M ${headBaseX} ${cy - 10} L ${tipX} ${cy} L ${headBaseX} ${cy + 10} Z`}
          fill={STRUCT_FILL}
        />
      </g>
    );
  }

  return (
    <>
      {arrow(y1, 'left')}
      {arrow(y2, 'right')}
    </>
  );
}

function styleFor(space: SpaceStatusRow | undefined): StallStyle {
  if (!space) return UNKNOWN;
  if (!space.isActive) return DISABLED;
  return space.status === 'EMPTY' ? AVAILABLE : OCCUPIED;
}

/**
 * 출차 완료(EXITED)된 예약은 대시보드 표에서는 그날의 기록으로 계속 보여주지만,
 * 평면도는 "지금 이 순간의 현황"만 나타내면 되므로 여기서는 제외한다 — 안 그러면
 * 이미 나간 자리가 계속 클릭 가능한 상태로 남거나 툴팁에 지난 예약이 걸린다.
 */
function activeOccupancies(space: SpaceStatusRow | undefined): SpaceStatusRow['occupancies'] {
  return (space?.occupancies ?? []).filter((occupancy) => occupancy.reservationStatus !== 'EXITED');
}

/** 마우스를 올렸을 때 나오는 설명 */
function tooltipFor(code: string, space: SpaceStatusRow | undefined): string {
  if (!space) return `${code} — 등록되지 않은 주차면`;
  if (!space.isActive) return `${code} — 비활성`;
  const typeSuffix = space.spaceType === 'DISABLED' ? ' (장애인 주차면)' : '';
  const occupancies = activeOccupancies(space);
  if (occupancies.length === 0) return `${code}${typeSuffix} — 사용 가능`;

  const lines = occupancies.map((occupancy) => {
    const range = `${formatKstTime(occupancy.visitStartAt)}~${formatKstTime(occupancy.visitEndAt)}`;
    const mark = occupancy.reservationId === space.inUseReservationId ? ' (사용 중)' : '';
    return `${range} ${occupancy.vehicleNo}${mark}`;
  });
  return `${code}${typeSuffix}\n${lines.join('\n')}`;
}

type Props =
  /** 관리자 대시보드: 주차면 상태를 색으로 표시한다. 어느 구역인지는 호출부가 정한다. */
  | { spaces: SpaceStatusRow[]; layout: MapLayout; highlightCode?: undefined }
  /** 신청자 화면: 배정된 한 면만 강조하고 나머지는 회색으로 둔다. 도면은 코드로 자동 탐지한다. */
  | { spaces?: undefined; layout?: undefined; highlightCode: string | null };

export function ParkingMap({ spaces, layout: explicitLayout, highlightCode }: Props) {
  const requesterView = spaces === undefined;
  const layout = requesterView
    ? highlightCode
      ? findLayoutForStallCode(highlightCode)
      : null
    : explicitLayout;

  const byCode = new Map((spaces ?? []).map((space) => [space.spaceCode, space]));

  /** 예약이 여러 건인 주차면을 눌렀을 때 목록을 띄울 대상. */
  const [pickerCode, setPickerCode] = useState<string | null>(null);
  const picker = pickerCode ? byCode.get(pickerCode) : undefined;

  useEffect(() => {
    if (!pickerCode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerCode(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickerCode]);

  /*
   * 도면은 구역 배치에 맞춰 그려져 있다. 해당 구역 도면이 없거나(아직 도면을 못 만든 새
   * 구역), 표시할 주차면이 도면과 하나도 맞지 않으면 빈 도면을 띄우는 대신 아무것도 그리지
   * 않는다.
   */
  if (!layout) return null;
  const matches = requesterView
    ? layout.stalls.some((stall) => stall.code === highlightCode)
    : layout.stalls.some((stall) => byCode.has(stall.code));
  if (!matches) return null;

  const counts = { available: 0, occupied: 0, disabled: 0 };
  for (const stall of layout.stalls) {
    const space = byCode.get(stall.code);
    if (!space) continue;
    if (!space.isActive) counts.disabled += 1;
    else if (space.status === 'EMPTY') counts.available += 1;
    else counts.occupied += 1;
  }

  // 층마다 다른 크기로 맞추지 않고 모든 층이 SHARED_VIEWBOX_W/H 를 그대로 쓴다 —
  // 그래야 같은 좌표에 둔 요소(엘리베이터 등)가 층을 바꿔도 화면상 같은 위치·크기로
  // 보인다. 건물이 공유 크기보다 작은 층은 오른쪽/아래쪽에 여백이 남을 뿐이다.
  const viewBoxW = SHARED_VIEWBOX_W;
  const viewBoxH = SHARED_VIEWBOX_H;

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
        mx-auto + max-w 로 카드 폭보다 도면이 좁을 때(세로로 긴 층 등) 좌우로 늘어나지 않고
        가운데 정렬되게 한다.
      */}
      <svg
        viewBox={`-8 -8 ${viewBoxW} ${viewBoxH}`}
        className="mx-auto h-auto w-full max-w-3xl"
        role="img"
        aria-label={
          requesterView
            ? `주차 평면도. 배정된 주차 위치는 ${highlightCode} 입니다.`
            : `주차 평면도. 사용 가능 ${counts.available}면, 예약·사용 중 ${counts.occupied}면, 비활성 ${counts.disabled}면.`
        }
      >
        {/*
          건물 배경. 방(rooms)이나 주차면으로 명시되지 않은 나머지 공간(통로·포장 구역 등)도
          빈 흰 바탕이 아니라 "주차 구역이 아닌 공간"으로 흰 바닥으로 보이게 하는 바닥층이다.
          방·주차면·출입구는 이 위에 그려 덮는다.
        */}
        <rect
          x={0}
          y={0}
          width={u(layout.building.w)}
          height={u(layout.building.h)}
          rx={STALL_RADIUS * 2}
          fill="#ffffff"
        />

        {layout.roomShape ? (
          <path
            d={roundedPolygonPath(
              layout.roomShape.map(([x, y]) => [u(x), u(y)]),
              8,
            )}
            fill={ROOM_FILL}
            stroke={ROOM_LINE}
            strokeWidth={1.5}
          />
        ) : (
          layout.rooms.map((room) => (
            <g key={`${room.x}-${room.y}`}>
              <rect
                x={u(room.x)}
                y={u(room.y)}
                width={u(room.w)}
                height={u(room.h)}
                fill="#e2e8f0"
                stroke="#cbd5e1"
                strokeWidth={1.5}
              />
              {room.label && (
                <text
                  x={u(room.x + room.w / 2)}
                  y={u(room.y + room.h / 2)}
                  fontSize={9}
                  fontWeight={700}
                  fill="#64748b"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {room.label}
                </text>
              )}
            </g>
          ))
        )}

        {layout.elevator && (
          <>
            <rect
              x={u(layout.elevator.x)}
              y={u(layout.elevator.y)}
              width={u(layout.elevator.w)}
              height={u(layout.elevator.h)}
              rx={STALL_RADIUS * 2}
              fill={STRUCT_FILL}
              stroke={STRUCT_LINE}
              strokeWidth={2}
            />
            <text
              x={u(layout.elevator.x + layout.elevator.w / 2)}
              y={u(layout.elevator.y + layout.elevator.h / 2) + 5}
              fontSize={13}
              fontWeight={700}
              fill="#ffffff"
              textAnchor="middle"
            >
              엘리베이터
            </text>
          </>
        )}

        {layout.entrance && <EntranceArrows box={layout.entrance} />}

        {/* 건물 외곽선 */}
        <rect
          x={0}
          y={0}
          width={u(layout.building.w)}
          height={u(layout.building.h)}
          rx={STALL_RADIUS * 2}
          fill="none"
          stroke="#0f172a"
          strokeWidth={4}
        />

        {layout.stalls.map((stall) => {
          const space = byCode.get(stall.code);
          const mine = requesterView && stall.code === highlightCode;
          const style = requesterView ? (mine ? MINE : NEUTRAL) : styleFor(space);
          const cx = u(stall.x + stall.w / 2);
          const cy = u(stall.y + stall.h / 2);
          const occupancies = requesterView ? [] : activeOccupancies(space);
          const isDisabledSpace = !requesterView && space?.spaceType === 'DISABLED';
          const label = (
            <>
              <rect
                x={u(stall.x)}
                y={u(stall.y)}
                width={u(stall.w)}
                height={u(stall.h)}
                rx={STALL_RADIUS}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={mine ? 3 : 1.2}
                strokeDasharray={space?.spaceType === 'DOUBLE' ? '3 2' : undefined}
              />
              <text
                x={cx}
                y={cy}
                fontSize={9.5}
                fontWeight={700}
                fill={style.text}
                textAnchor="middle"
                dominantBaseline="central"
                transform={stall.rotated ? undefined : `rotate(-90 ${cx} ${cy})`}
              >
                {stall.code}
              </text>
              {/*
                장애인 주차면은 휠체어 픽토그램(국제 장애인 접근성 심볼)으로 구분 표시를
                더한다. 사용자가 준 원본 도면 이미지에서 실제 픽토그램의 칸 안 위치·크기를
                픽셀 단위로 측정한 비율(왼쪽에서 9.5%, 위에서 51.9% 지점에서 시작해 칸
                너비의 26%·높이의 44%)을 그대로 써서, 아이콘을 24x24 기준 좌표로 그린 뒤
                그 비율만큼 옮기고 늘린다 — 원본 이미지와 같은 자리·같은 비율로 보이게
                하기 위함이다.
              */}
              {isDisabledSpace && (
                <g
                  transform={`translate(${u(stall.x + stall.w * 0.0952)} ${u(stall.y + stall.h * 0.5185)}) scale(${u(stall.w * 0.2619) / 24} ${u(stall.h * 0.4444) / 24})`}
                  aria-hidden="true"
                >
                  <title>장애인 주차면</title>
                  <circle cx={9} cy={16} r={6} fill="none" stroke={style.text} strokeWidth={1.6} />
                  <circle cx={13} cy={4} r={2.2} fill={style.text} />
                  <path
                    d="M13 7 L13 12 L9 16 M9 12 L15 12"
                    stroke={style.text}
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
              {/*
                예약이 두 건 이상이면 눌렀을 때 바로 넘어가지 않고 목록이 뜬다.
                누르기 전에 알 수 있도록 건수를 표시한다.
              */}
              {occupancies.length > 1 && (
                <>
                  <circle
                    cx={u(stall.x + stall.w) - 7}
                    cy={u(stall.y) + 7}
                    r={6.5}
                    fill="#ffffff"
                    stroke={style.stroke}
                    strokeWidth={1.2}
                  />
                  <text
                    x={u(stall.x + stall.w) - 7}
                    y={u(stall.y) + 10}
                    fontSize={8.5}
                    fontWeight={700}
                    fill={style.stroke}
                    textAnchor="middle"
                  >
                    {occupancies.length}
                  </text>
                </>
              )}
              {/* 신청자 화면에서는 다른 예약자의 정보를 툴팁으로도 노출하지 않는다. */}
              {!requesterView && <title>{tooltipFor(stall.code, space)}</title>}
            </>
          );

          // 예약이 한 건이면 바로 상세로, 여러 건이면 골라야 하므로 패널을 띄운다.
          if (occupancies.length === 1) {
            return (
              <Link key={stall.code} href={`/admin/reservations/${occupancies[0].reservationId}`}>
                {label}
              </Link>
            );
          }
          if (occupancies.length > 1) {
            /*
             * `<g onClick>` 이 아니라 링크로 두는 이유.
             *
             * iOS Safari 는 원래 누를 수 있는 요소(a, button, input)가 아니면 click 이벤트를
             * 위로 전달하지 않는다. React 는 루트 컨테이너에 리스너를 하나 걸어 두고 처리하므로
             * `<g>` 에 붙인 onClick 이 아이폰에서는 아예 호출되지 않았다.
             *
             * 링크로 두면 네이티브로 누를 수 있는 요소가 되어 아이폰에서도 동작하고,
             * 키보드 조작(Tab/Enter)도 브라우저가 알아서 해 준다. href 는 첫 예약을 가리켜
             * 스크립트가 실패해도 최소한 이동은 되게 남겨 둔다.
             */
            return (
              <Link
                key={stall.code}
                href={`/admin/reservations/${occupancies[0].reservationId}`}
                className="cursor-pointer"
                aria-label={`${stall.code} 예약 ${occupancies.length}건 선택`}
                onClick={(event) => {
                  event.preventDefault();
                  setPickerCode(stall.code);
                }}
              >
                {label}
              </Link>
            );
          }
          return <g key={stall.code}>{label}</g>;
        })}
      </svg>

      {picker && <ReservationPicker space={picker} onClose={() => setPickerCode(null)} />}
    </div>
  );
}

/** 한 주차면에 걸린 예약이 여러 건일 때 고르는 패널. */
function ReservationPicker({ space, onClose }: { space: SpaceStatusRow; onClose: () => void }) {
  const occupancies = activeOccupancies(space);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parking-map-picker-title"
    >
      {/*
        배경도 버튼으로 둔다. div 에 onClick 을 걸면 위 주차면과 같은 이유로
        아이폰에서 눌리지 않는다. 겸사겸사 패널 안쪽 클릭을 막을 필요도 없어진다.
      */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="닫기"
        onClick={onClose}
      />

      <div className="card relative w-full max-w-md">
        <div className="card-body space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="parking-map-picker-title" className="card-title">
                {space.spaceCode}
              </h3>
              <p className="field-hint">
                예약 {occupancies.length}건이 걸려 있습니다. 볼 예약을 선택하세요.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>

          <ul className="space-y-2">
            {occupancies.map((occupancy) => (
              <li key={occupancy.reservationId}>
                <Link
                  href={`/admin/reservations/${occupancy.reservationId}`}
                  className="hover:border-brand-500 hover:bg-brand-50 block rounded-lg border border-slate-200 px-3 py-2.5 transition"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-700 text-sm font-bold">
                      {formatKstTime(occupancy.visitStartAt)} ~{' '}
                      {formatKstTime(occupancy.visitEndAt)}
                    </span>
                    {occupancy.reservationId === space.inUseReservationId && (
                      <span className="badge bg-emerald-100 text-emerald-800">사용 중</span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-800">
                      {occupancy.vehicleNo}
                    </span>
                    <span className="font-mono">{occupancy.reservationNo}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
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
