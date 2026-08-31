/**
 * 주차 평면도 배치 (지하 1층 / 지상 1층).
 *
 * 지하 1층은 사용자가 검토·승인한 모노톤 둥근 사각형 디자인(artifact "지하 1층 배치도
 * 초안" v10)을 그대로 좌표화한 것이다 — 원본 도면 이미지에서 뽑은 각 요소의 중심 위치는
 * 유지하되(차량 출입구 제외), 주차면 크기는 전부 동일하게, 모서리는 둥글게, 비주차
 * 개방 구역은 이음매 없는 도형 하나로 다시 그렸다. `scripts/_gen-layout-ts.mjs` 로
 * 좌표를 뽑았다(재현이 필요하면 그 스크립트의 BLOCKS/ELEVATOR/ENTRANCE/ROOM_L 값만
 * 고쳐 다시 실행하면 된다).
 *
 * 단위는 건물 왼쪽 위 모서리를 원점으로 하는 픽셀 기준 유닛(20px = 1 유닛)이며,
 * 실제 mm 단위와는 무관하다 — "이 도면과 같은 비율"을 재현하는 것이 목적이다.
 * 지상 1층은 이번 라운드에서 손대지 않아 예전 방식(사각형 rooms, 직각 모서리) 그대로다.
 *
 * 주차면 좌표를 DB 에 두지 않는 이유는 요구사항(도면 좌표 컬럼 금지) 때문이며,
 * 배치가 바뀌는 일이 드물어 화면 상수로 두는 편이 다루기 쉽다.
 * 주차면은 `spaceCode` 로 DB 와 연결된다.
 */

export type MapStall = {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** true 면 가로로 넓은 배치라 글자를 돌리지 않는다. false 면 세로로 좁아 글자를 -90도 돌린다. */
  rotated: boolean;
  block: string;
};

export type MapRoom = { x: number; y: number; w: number; h: number; label?: string };

export type MapLayout = {
  building: { w: number; h: number };
  /**
   * 차량 출입구. 라벨·박스 없이 이 사각형 영역 안에 진입/진출 화살표 2개만 그린다
   * (건물 검은 외곽선 밖으로 나가지 않는다). 없는 층은 생략한다.
   */
  entrance?: { x: number; y: number; w: number; h: number };
  elevator?: { x: number; y: number; w: number; h: number };
  /**
   * 비주차 개방 구역을 사각형 여러 개 대신 꼭짓점을 둥글린 다각형 하나로 그릴 때 쓴다
   * (사각형을 이어 붙이면 만나는 지점에 테두리가 겹쳐 보인다). 있으면 `rooms` 대신
   * 이걸로 그린다.
   */
  roomShape?: readonly (readonly [number, number])[];
  rooms: readonly MapRoom[];
  stalls: readonly MapStall[];
};

const B1_BUILDING = { w: 79.35, h: 36 } as const;

/** 차량 출입구 — 건물 안쪽, 화살표만 표시. */
const B1_ENTRANCE = { x: 69.25, y: 5.85, w: 6.55, h: 5.85 } as const;

/** 엘리베이터 */
const B1_ELEVATOR = { x: 49.25, y: 0.2, w: 7.75, h: 4.7 } as const;

/** 비주차 개방 구역(설비 구역 등). 이음매 없는 L자 도형 하나로 그린다. */
const B1_ROOM_SHAPE: readonly (readonly [number, number])[] = [
  [0.3, 0.2],
  [57.25, 0.2],
  [57.25, 17.1],
  [34, 17.1],
  [34, 22.6],
  [0.3, 22.6],
];

/** 지하 1층 주차면 65면(이중주차 6면 포함). spaceCode 로 DB 의 주차면과 연결된다. */
const B1_STALLS: readonly MapStall[] = [
  { code: 'B1-07', x: 58.98, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-06', x: 61.38, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-05', x: 63.78, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-04', x: 66.18, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-03', x: 69.5, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-02', x: 71.9, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-01', x: 74.3, y: 0.3, w: 2.4, h: 4.5, rotated: false, block: '우상단' },
  { code: 'B1-10', x: 68.8, y: 13.2, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-09', x: 71.2, y: 13.2, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-08', x: 73.6, y: 13.2, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-14', x: 68.8, y: 18.15, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-13', x: 71.2, y: 18.15, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-12', x: 73.6, y: 18.15, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-11', x: 76, y: 18.15, w: 2.4, h: 4.5, rotated: false, block: '우측 중단' },
  { code: 'B1-27', x: 35.08, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-26', x: 37.48, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-25', x: 39.88, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-24', x: 42.28, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-23', x: 46.05, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-22', x: 48.45, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-21', x: 50.85, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-20', x: 53.25, y: 18.35, w: 2.4, h: 4.5, rotated: false, block: '중앙' },
  { code: 'B1-15', x: 57.45, y: 11.5, w: 4.5, h: 2.4, rotated: true, block: '우측 세로' },
  { code: 'B1-16', x: 57.45, y: 13.9, w: 4.5, h: 2.4, rotated: true, block: '우측 세로' },
  { code: 'B1-17', x: 57.45, y: 16.3, w: 4.5, h: 2.4, rotated: true, block: '우측 세로' },
  { code: 'B1-18', x: 57.45, y: 18.7, w: 4.5, h: 2.4, rotated: true, block: '우측 세로' },
  { code: 'B1-19', x: 57.45, y: 21.1, w: 4.5, h: 2.4, rotated: true, block: '우측 세로' },
  { code: 'B1-59', x: 6.5, y: 22.48, w: 4.5, h: 2.4, rotated: true, block: '남측 장변' },
  { code: 'B1-58', x: 11, y: 22.48, w: 4.5, h: 2.4, rotated: true, block: '남측 장변' },
  { code: 'B1-57', x: 15.5, y: 22.48, w: 4.5, h: 2.4, rotated: true, block: '남측 장변' },
  { code: 'B1-56', x: 20, y: 22.48, w: 4.5, h: 2.4, rotated: true, block: '남측 장변' },
  { code: 'B1-55', x: 0.78, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-54', x: 3.18, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-53', x: 5.58, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-52', x: 7.98, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-51', x: 11.8, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-50', x: 14.2, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-49', x: 16.6, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-48', x: 19, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-47', x: 23.48, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-46', x: 25.88, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-45', x: 28.28, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-44', x: 30.68, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-43', x: 34.98, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-42', x: 37.38, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-41', x: 39.78, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-40', x: 42.18, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-39', x: 46.15, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-38', x: 48.55, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-37', x: 50.95, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-36', x: 53.35, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-35', x: 58, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-34', x: 60.4, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-33', x: 62.8, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-32', x: 65.2, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-31', x: 68.75, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-30', x: 71.15, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-29', x: 73.55, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },
  { code: 'B1-28', x: 75.95, y: 30.93, w: 2.4, h: 4.5, rotated: false, block: '남측 장변' },

  /** 이중주차 6면. B1-60/61 줄과 B1-62/63 줄 사이에 세로 간격을 둔다. */
  { code: 'B1-60', x: 37.4, y: 24.23, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
  { code: 'B1-62', x: 37.4, y: 27.43, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
  { code: 'B1-61', x: 48.6, y: 24.23, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
  { code: 'B1-63', x: 48.6, y: 27.43, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
  { code: 'B1-64', x: 68.7, y: 23.2, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
  { code: 'B1-65', x: 74, y: 23.2, w: 4.5, h: 2.4, rotated: true, block: '이중주차' },
];

export const B1_LAYOUT: MapLayout = {
  building: B1_BUILDING,
  entrance: B1_ENTRANCE,
  elevator: B1_ELEVATOR,
  roomShape: B1_ROOM_SHAPE,
  rooms: [],
  stalls: B1_STALLS,
};

/**
 * 지상 1층 주차 구역.
 *
 * 일반 3면(1F-01, 1F-05, 1F-06) + 장애인 3면(1F-02~04). 사용자가 전달한 지상 1층 도면
 * 스크린샷에서 픽셀 좌표를 그대로 옮겼다 — 엘리베이터가 지하 1층과 도면상 같은 화면
 * 위치에 그려져 있어(원점만 각자 건물 기준으로 다시 잡음) 두 탭을 오갈 때 엘리베이터
 * 위치가 어긋나지 않는다. 엘리베이터 오른쪽의 작은 방과 "관리실"도 도면 그대로 옮겼다.
 * 이번 라운드에서는 손대지 않아 예전 방식(사각형 rooms) 그대로다.
 */
const GROUND_1F_BUILDING = { w: 76.0, h: 34.3 } as const;

// 지하 1층과 정확히 같은 좌표를 써서, 두 탭을 오갈 때 엘리베이터 위치가 절대
// 어긋나지 않게 한다.
const GROUND_1F_ELEVATOR = B1_ELEVATOR;

const GROUND_1F_ROOMS: readonly MapRoom[] = [
  { x: 0, y: 0, w: 66.0, h: 28.5 },
  { x: 72.2, y: 0.1, w: 3.85, h: 4.7 },
  { x: 72.2, y: 17.7, w: 3.85, h: 8.6, label: '관리실' },
];

export const GROUND_1F_LAYOUT: MapLayout = {
  building: GROUND_1F_BUILDING,
  rooms: GROUND_1F_ROOMS,
  elevator: GROUND_1F_ELEVATOR,
  // 일반(1F-01/05/06)·장애인(1F-02/03/04) 주차면 모두 지하 1층과 같은 고정 크기
  // (세로 칸 2.4x4.5 / 가로 칸 4.5x2.4)로 통일해, 세 구역(지하 1층·지상 일반·지상
  // 장애인)이 전부 같은 크기로 보이게 한다. 위치는 기존 배치의 중심을 그대로 쓴다.
  stalls: [
    { code: '1F-01', x: 71.3, y: 7.1, w: 4.5, h: 2.4, rotated: true, block: '지상' },
    { code: '1F-02', x: 71.3, y: 9.5, w: 4.5, h: 2.4, rotated: true, block: '지상' },
    { code: '1F-03', x: 71.3, y: 11.9, w: 4.5, h: 2.4, rotated: true, block: '지상' },
    { code: '1F-04', x: 71.3, y: 14.3, w: 4.5, h: 2.4, rotated: true, block: '지상' },
    { code: '1F-06', x: 70.85, y: 26.6, w: 2.4, h: 4.5, rotated: false, block: '지상' },
    { code: '1F-05', x: 73.25, y: 26.6, w: 2.4, h: 4.5, rotated: false, block: '지상' },
  ],
};

/** 주차장 구역 코드(ParkingArea.areaCode) → 평면도. 관리자 대시보드 탭에서 쓴다. */
export const LAYOUTS_BY_AREA_CODE: Readonly<Record<string, MapLayout>> = {
  MAIN: B1_LAYOUT,
  GROUND: GROUND_1F_LAYOUT,
};

/**
 * 주차면 코드로 그 면이 속한 평면도를 찾는다.
 *
 * 신청자 조회 화면은 배정된 주차면 코드(highlightCode)만 알고 어느 층인지는 모르므로,
 * 이 함수로 도면을 자동으로 고른다.
 */
export function findLayoutForStallCode(code: string): MapLayout | null {
  for (const layout of Object.values(LAYOUTS_BY_AREA_CODE)) {
    if (layout.stalls.some((stall) => stall.code === code)) return layout;
  }
  return null;
}
