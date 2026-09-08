import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

import {
  findLayoutForStallCode,
  LAYOUTS_BY_AREA_CODE,
  type MapLayout,
} from '@/domain/parking-map-layout';
import type { EmailAttachment } from '@/lib/email/email-provider';

/**
 * 배정된 주차 위치를 강조한 평면도를 PNG 로 렌더링한다.
 *
 * `src/components/parking-map.tsx`(`ParkingMap`, 신청자 조회 화면이 쓰는 것과 같은 그림)의
 * "본인 자리만 강조" 모드를 그대로 재구현한 것이다 — React 컴포넌트를 그대로 재사용하지
 * 않는 이유: Next.js 가 서버 번들에서 `react-dom/server`(renderToStaticMarkup) 직접 사용을
 * 막고("render or return the content directly as a Server Component instead"), 그
 * 경로로 시도했을 때 빌드 자체가 실패했다. 그래서 좌표 데이터(parking-map-layout.ts)는
 * 그대로 재사용하되, SVG 문자열은 이 파일에서 직접 만든다. 두 곳의 그림이 달라지지
 * 않도록 좌표계·색상·크기 상수를 `ParkingMap`과 동일하게 맞춰 뒀다 — 그쪽을 고치면
 * 이쪽도 같이 봐야 한다.
 */

export const PARKING_MAP_CID = 'parking-map-image';

const U = 10;
const u = (meters: number) => Math.round(meters * U * 10) / 10;

const SHARED_VIEWBOX_W =
  Math.max(...Object.values(LAYOUTS_BY_AREA_CODE).map((layout) => layout.building.w * 10)) + 16;
const SHARED_VIEWBOX_H =
  Math.max(...Object.values(LAYOUTS_BY_AREA_CODE).map((layout) => layout.building.h * 10)) + 16;

const STRUCT_FILL = '#52525b';
const STRUCT_LINE = '#27272a';
const ROOM_FILL = '#e8ebef';
const ROOM_LINE = '#b8c0cc';
const STALL_RADIUS = 4;

const MINE = { fill: '#22c55e', stroke: '#15803d', text: '#ffffff' };
const NEUTRAL = { fill: '#f8fafc', stroke: '#cbd5e1', text: '#cbd5e1' };

/**
 * 대시보드/조회 화면(`ParkingMap`)이 실제로 렌더링되는 폰트(Windows 기본 맑은 고딕)와
 * 맞추기 위한 값. resvg 는 CSS 캐스케이드가 없어 명시하지 않으면 자체 기본 폰트를 쓴다.
 */
const MAP_FONT_FAMILY = "'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif";

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `ParkingMap`의 roundedPolygonPath와 동일 — 다각형 꼭짓점을 둥글린 path를 만든다. */
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

/** `ParkingMap`의 EntranceArrows와 동일 — 차량 출입구 사각형 안에 진입/진출 화살표만 그린다. */
function entranceArrowsSvg(box: { x: number; y: number; w: number; h: number }): string {
  const x = u(box.x);
  const y = u(box.y);
  const w = u(box.w);
  const h = u(box.h);
  const cx = x + w / 2;
  const rowH = h / 2 - 3;
  const y1 = y + rowH / 2;
  const y2 = y + h - rowH / 2;

  function arrow(cy: number, dir: 'left' | 'right'): string {
    const half = w / 2 - 3;
    const shaftW = 8;
    const headW = 17;
    const tailX = dir === 'left' ? cx + half : cx - half;
    const tipX = dir === 'left' ? cx - half : cx + half;
    const headBaseX = dir === 'left' ? tipX + headW : tipX - headW;
    const rectX = Math.min(tailX, headBaseX);
    const rectW = Math.abs(headBaseX - tailX);
    return `
      <rect x="${rectX}" y="${cy - shaftW / 2}" width="${rectW}" height="${shaftW}" fill="${STRUCT_FILL}" />
      <path d="M ${headBaseX} ${cy - 10} L ${tipX} ${cy} L ${headBaseX} ${cy + 10} Z" fill="${STRUCT_FILL}" />`;
  }

  return `${arrow(y1, 'left')}${arrow(y2, 'right')}`;
}

/** `ParkingMap`의 highlightCode(신청자 조회) 모드와 동일한 그림을 SVG 문자열로 만든다. */
function buildParkingMapSvg(highlightCode: string): string | null {
  const layout: MapLayout | null = findLayoutForStallCode(highlightCode);
  if (!layout) return null;

  const viewBoxW = SHARED_VIEWBOX_W;
  const viewBoxH = SHARED_VIEWBOX_H;

  const roomsSvg = layout.roomShape
    ? `<path d="${roundedPolygonPath(
        layout.roomShape.map(([x, y]) => [u(x), u(y)]),
        8,
      )}" fill="${ROOM_FILL}" stroke="${ROOM_LINE}" stroke-width="1.5" />`
    : layout.rooms
        .map(
          (room) => `
      <rect x="${u(room.x)}" y="${u(room.y)}" width="${u(room.w)}" height="${u(room.h)}" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5" />
      ${
        room.label
          ? `<text x="${u(room.x + room.w / 2)}" y="${u(room.y + room.h / 2)}" font-size="9" font-weight="700" fill="#64748b" text-anchor="middle" dominant-baseline="central">${escapeXml(room.label)}</text>`
          : ''
      }`,
        )
        .join('');

  const elevatorSvg = layout.elevator
    ? `
      <rect x="${u(layout.elevator.x)}" y="${u(layout.elevator.y)}" width="${u(layout.elevator.w)}" height="${u(layout.elevator.h)}" rx="${STALL_RADIUS * 2}" fill="${STRUCT_FILL}" stroke="${STRUCT_LINE}" stroke-width="2" />
      <text x="${u(layout.elevator.x + layout.elevator.w / 2)}" y="${u(layout.elevator.y + layout.elevator.h / 2) + 5}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">엘리베이터</text>`
    : '';

  const entranceSvg = layout.entrance ? entranceArrowsSvg(layout.entrance) : '';

  // 주차면끼리 간격 없이 붙어 있어서, 강조 테두리(stroke-width 3)가 이웃 칸으로 삐져나온다.
  // 배열 순서 그대로 그리면 다음에 그려지는 이웃이 그 테두리를 덮어버리므로, 강조 칸을
  // 맨 마지막에 그려 항상 위에 오도록 정렬한다(`ParkingMap`과 동일한 처리).
  const stallsSvg = [...layout.stalls]
    .sort((a, b) => Number(a.code === highlightCode) - Number(b.code === highlightCode))
    .map((stall) => {
      const mine = stall.code === highlightCode;
      const style = mine ? MINE : NEUTRAL;
      const cx = u(stall.x + stall.w / 2);
      const cy = u(stall.y + stall.h / 2);
      const transform = stall.rotated ? '' : `rotate(-90 ${cx} ${cy})`;
      return `
      <g>
        <rect x="${u(stall.x)}" y="${u(stall.y)}" width="${u(stall.w)}" height="${u(stall.h)}" rx="${STALL_RADIUS}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${mine ? 3 : 1.2}" />
        <text x="${cx}" y="${cy}" font-size="9.5" font-weight="700" fill="${style.text}" text-anchor="middle" dominant-baseline="central" transform="${transform}">${escapeXml(stall.code)}</text>
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 ${viewBoxW} ${viewBoxH}" font-family="${MAP_FONT_FAMILY}">
    <rect x="0" y="0" width="${u(layout.building.w)}" height="${u(layout.building.h)}" rx="${STALL_RADIUS * 2}" fill="#ffffff" />
    ${roomsSvg}
    ${elevatorSvg}
    ${entranceSvg}
    <rect x="0" y="0" width="${u(layout.building.w)}" height="${u(layout.building.h)}" rx="${STALL_RADIUS * 2}" fill="none" stroke="#0f172a" stroke-width="4" />
    ${stallsSvg}
  </svg>`;
}

/**
 * spaceCode 별 렌더링 결과 캐시.
 *
 * resvg 렌더링은 spaceCode(+정적 도면 데이터)만으로 결과가 완전히 결정되는 순수 함수인데,
 * 동기(sync) 네이티브 호출이라 실행되는 동안 Node 이벤트 루프 전체가 막힌다(실측 2.3~2.5초).
 * 같은 주차 위치가 승인 때마다 반복해서 배정되므로, 한 번 그린 결과를 프로세스 메모리에
 * 담아 두면 같은 spaceCode 의 다음 승인부터는 렌더링 없이 즉시 반환된다. 담긴 Buffer 는
 * 발송 시 읽히기만 하고 변형되지 않으므로 여러 메일이 같은 인스턴스를 공유해도 안전하다.
 */
const attachmentCache = new Map<string, EmailAttachment | null>();

/**
 * `npm run build`가 `prebuild`(`scripts/generate-parking-map-assets.ts`)로 전체 자리 코드를
 * 미리 렌더링해 두는 위치. 여기 파일이 있으면 렌더링 없이 읽기만 하므로 런타임에 이벤트
 * 루프가 막히지 않는다 — 파일이 없으면(로컬 `next dev` 등 prebuild 를 안 거친 환경, 혹은
 * 아직 재생성 전인 신규 자리 코드) 기존처럼 그 자리에서 렌더링하는 폴백으로 넘어간다.
 */
const GENERATED_DIR = path.join(process.cwd(), 'generated', 'parking-maps');

export function generatedAssetPath(spaceCode: string): string {
  return path.join(GENERATED_DIR, `${spaceCode}.png`);
}

/**
 * `spaceCode`가 어느 도면에도 없으면(구코드 등) null을 반환한다 — 호출부는 이미지 없이
 * 텍스트 안내만 남기면 된다. 메일 발송 자체를 막으면 안 되므로 예외를 던지지 않는다.
 */
export function renderParkingMapAttachment(spaceCode: string): EmailAttachment | null {
  const cached = attachmentCache.get(spaceCode);
  if (cached !== undefined) return cached;

  try {
    const content = fs.readFileSync(generatedAssetPath(spaceCode));
    const attachment: EmailAttachment = {
      filename: 'parking-map.png',
      contentType: 'image/png',
      cid: PARKING_MAP_CID,
      content,
    };
    attachmentCache.set(spaceCode, attachment);
    return attachment;
  } catch {
    // 파일이 없으면 아래 렌더링 폴백으로 넘어간다.
  }

  const svg = buildParkingMapSvg(spaceCode);
  if (!svg) {
    attachmentCache.set(spaceCode, null);
    return null;
  }

  const png = new Resvg(svg, {
    background: 'white',
    fitTo: { mode: 'width', value: 900 },
  })
    .render()
    .asPng();

  const attachment: EmailAttachment = {
    filename: 'parking-map.png',
    contentType: 'image/png',
    cid: PARKING_MAP_CID,
    content: Buffer.from(png),
  };
  attachmentCache.set(spaceCode, attachment);
  return attachment;
}
