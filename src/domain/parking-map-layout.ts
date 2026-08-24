/**
 * 지하 1층 주차 평면도 배치.
 *
 * 원본 CAD 도면(동탄사업장 LAYOUT, 도면번호 SY-01-05-1)의 벡터를 추출해 얻은 실측값이다.
 * 주차면 규격 2,300 x 5,000mm, 원본 축척 17.29mm/도면단위.
 *
 * 단위는 전부 **미터**이며 좌상단이 원점, 오른쪽이 차량 출입구 방향이다.
 * 주차면 좌표를 DB 에 두지 않는 이유는 요구사항(도면 좌표 컬럼 금지) 때문이며,
 * 배치가 바뀌는 일이 드물어 화면 상수로 두는 편이 다루기 쉽다.
 * 주차면은 `spaceCode` 로 DB 와 연결된다.
 */

export const MAP_BUILDING = { w: 86.8, h: 37.9 } as const;

/** 차량 출입구 (건물 우측, 지상 연결) */
export const MAP_ENTRANCE = { yTop: 6.9, yBottom: 14.9, xOut: 96.2 } as const;

/** 엘리베이터 (지상 연결) */
export const MAP_ELEVATOR = { x: 54.4, y: 0.2, w: 8.5, h: 5.1 } as const;

/**
 * 비주차 영역(설비실 등).
 * 원본은 여러 실로 나뉘지만 주차 안내에는 구분이 필요 없어 ㄴ자 형태로 합쳐 표시한다.
 */
export const MAP_ROOMS = [
  { x: 0.8, y: 0.2, w: 62.4, h: 18.1 },
  { x: 0.8, y: 18.3, w: 39.0, h: 6.6 },
] as const;

export type MapStall = {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** true 면 90도 회전 배치(가로로 긴 주차면) */
  rotated: boolean;
  block: string;
};

type Row = { y: number; y2: number; from: number; to: number; count: number };
type Block =
  | { name: string; rows: Row[]; column?: undefined }
  | {
      name: string;
      column: { x: number; x2: number; from: number; to: number; count: number };
      rows?: undefined;
    };

/**
 * 주차면 블록.
 *
 * 번호는 출입구(우측)에서 가까운 블록부터, 각 열은 오른쪽 -> 왼쪽 순으로 붙는다.
 * rows 의 from/to 는 열의 오른쪽 끝 -> 왼쪽 끝 x 좌표다.
 */
const BLOCKS: Block[] = [
  {
    name: '우상단',
    rows: [
      { y: 0.5, y2: 5.53, from: 82.33, to: 75.47, count: 3 },
      { y: 0.5, y2: 5.53, from: 74.42, to: 65.19, count: 4 },
    ],
  },
  {
    name: '우측 중단',
    rows: [
      { y: 14.27, y2: 19.28, from: 82.33, to: 75.38, count: 3 },
      { y: 19.28, y2: 24.29, from: 84.62, to: 75.38, count: 4 },
    ],
  },
  {
    // 90도 회전 배치 — 위에서 아래로 쌓인다.
    name: '우측 세로',
    column: { x: 63.44, x2: 68.47, from: 12.69, to: 24.2, count: 5 },
  },
  {
    name: '중앙',
    rows: [
      { y: 19.28, y2: 24.29, from: 61.57, to: 52.34, count: 4 },
      { y: 19.28, y2: 24.29, from: 49.54, to: 40.31, count: 4 },
    ],
  },
  {
    name: '남측 장변',
    rows: (
      [
        [84.7, 75.47],
        [73.6, 64.37],
        [61.57, 52.34],
        [49.54, 40.31],
        [37.51, 28.28],
        [25.48, 16.25],
        [13.45, 4.22],
      ] as const
    ).map(([from, to]) => ({ y: 32.44, y2: 37.45, from, to, count: 4 })),
  },
];

function buildStalls(): MapStall[] {
  const stalls: MapStall[] = [];
  let seq = 0;
  const next = () => `B1-${String((seq += 1)).padStart(2, '0')}`;

  for (const block of BLOCKS) {
    if (block.column) {
      const { x, x2, from, to, count } = block.column;
      const step = (to - from) / count;
      for (let index = 0; index < count; index += 1) {
        stalls.push({
          code: next(),
          x,
          y: from + step * index,
          w: x2 - x,
          h: step,
          rotated: true,
          block: block.name,
        });
      }
      continue;
    }
    for (const row of block.rows) {
      const step = (row.from - row.to) / row.count;
      for (let index = 0; index < row.count; index += 1) {
        stalls.push({
          code: next(),
          x: row.from - step * (index + 1),
          y: row.y,
          w: step,
          h: row.y2 - row.y,
          rotated: false,
          block: block.name,
        });
      }
    }
  }
  return stalls;
}

/** 도면에 그릴 주차면 55면. spaceCode 로 DB 의 주차면과 연결된다. */
export const MAP_STALLS: readonly MapStall[] = buildStalls();
