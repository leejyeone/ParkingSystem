/**
 * 주차 평면도 배치 (지하 1층 / 지상 1층).
 *
 * 지하 1층은 사용자가 검토·승인한 모노톤 둥근 사각형 디자인(artifact "지하 1층 배치도
 * 초안" v10)을 그대로 좌표화한 것이다 — 원본 도면 이미지에서 뽑은 각 요소의 중심 위치는
 * 유지하되(차량 출입구 제외), 주차면 크기는 전부 동일하게, 모서리는 둥글게, 비주차
 * 개방 구역은 이음매 없는 도형 하나로 다시 그렸다. 좌표는 일회성 변환 스크립트(작업 후
 * 삭제)로 뽑았다 — 다시 맞춰야 하면 이 파일의 좌표값을 직접 고치면 된다(칸 하나당
 * `x/y/w/h`, 픽셀 기준 유닛).
 *
 * 지상 1층 주차면(1F-01~06)도 지하 1층과 같은 고정 크기로 맞췄고, 두 층의 엘리베이터는
 * 정확히 같은 좌표를 써서 층 탭을 오가도 화면상 위치가 어긋나지 않는다. 이 정렬은
 * `ParkingMap` 이 모든 층에 같은 viewBox 크기(가장 큰 건물 기준)를 쓰는 것과 함께
 * 동작한다 — 컴포넌트의 `SHARED_VIEWBOX_W/H` 주석 참고.
 *
 * 단위는 건물 왼쪽 위 모서리를 원점으로 하는 픽셀 기준 유닛(20px = 1 유닛)이며,
 * 실제 mm 단위와는 무관하다 — "이 도면과 같은 비율"을 재현하는 것이 목적이다.
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

/**
 * 지하 주차장으로 오르내리는 슬로프. 꼭짓점 다각형(계단 모양)을 대각선 빗금으로만 채워
 * 그린다(글자 없음). 관리자 화면 도면(`ADMIN_LAYOUTS_BY_AREA_CODE`)에만 들어 있다.
 */
export type MapSlope = {
  points: readonly (readonly [number, number])[];
};

export type MapLayout = {
  building: { w: number; h: number };
  /**
   * 차량 출입구. 라벨·박스 없이 이 사각형 영역 안에 진입/진출 화살표 2개만 그린다
   * (건물 검은 외곽선 밖으로 나가지 않는다). 없는 층은 생략한다.
   */
  entrance?: { x: number; y: number; w: number; h: number };
  /** 건물 아래쪽 바깥에 표시하는 출입구 표지(위쪽을 가리키는 삼각형 + 글자). x 는 삼각형 중심. */
  gate?: { x: number; label: string };
  elevator?: { x: number; y: number; w: number; h: number };
  slope?: MapSlope;
  /**
   * 비주차 개방 구역을 사각형 여러 개 대신 꼭짓점을 둥글린 다각형 하나로 그릴 때 쓴다
   * (사각형을 이어 붙이면 만나는 지점에 테두리가 겹쳐 보인다). 있으면 `rooms` 대신
   * 이걸로 그린다.
   */
  roomShape?: readonly (readonly [number, number])[];
  /** `roomShape` 폴리곤 위에 그릴 글자 라벨. 사각형이 아니라 중심 좌표를 직접 지정한다. */
  roomLabels?: readonly { x: number; y: number; text: string }[];
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
  roomLabels: [
    { x: 17.15, y: 11.4, text: '유틸리티센터' },
    { x: 45.63, y: 8.65, text: '물류센터' },
  ],
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
 * 관리자 화면 도면 — 지하 슬로프를 그릴 자리를 오른쪽에 확보한 파생 도면이다. 원본 상수
 * (`B1_LAYOUT` 등)는 그대로라 승인 메일 이미지와 신청자 조회 화면은 예전 모양 그대로 나온다.
 * 건물 외곽선(`building`)은 건드리지 않는다.
 *
 * **주차면 크기는 절대 바꾸지 않는다**(세로 칸 2.4×4.5 / 가로 칸 4.5×2.4 그대로). 대신
 * 전체 통로 간격을 고루 좁힌다(`compressGaps`): 같은 줄에서 붙어 있는 주차면 덩어리는 모양·크기
 * 그대로 통째로, 왼쪽 끝 위치에 비례해 왼쪽으로 옮긴다(오른쪽 덩어리일수록 더 많이). 그러면
 * 줄 모양과 줄 정렬은 그대로 유지되면서 덩어리 사이 통로만 비례해 좁아지고, 오른쪽에 슬로프
 * 자리가 생긴다. 방·엘리베이터 같은 비주차 요소는 x 를 같은 비율로 줄인다(엘리베이터는 두
 * 층 같은 식이라 층 탭을 오가도 어긋나지 않는다).
 */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 통로 간격 축소 비율(1 = 그대로). 덩어리의 왼쪽 끝 x 가 이 비율만큼 왼쪽으로 붙는다. */
const ADMIN_GAP_SCALE = 0.86;

/** 이 값보다 좁은 주차면 사이 틈은 통로가 아니라 한 덩어리의 일부로 보고 그대로 둔다. */
const ADMIN_RIGID_GAP = 1.2;

/** 좁혀진 뒤에도 같은 줄의 덩어리 사이에 남길 최소 틈. */
const ADMIN_MIN_GAP = 0.5;

/** 관리자 도면 엘리베이터 — 설비구역(B1 회색 영역 오른쪽 끝 49.24) 안에 들어오게 줄인 크기. 두 층 동일. */
const ADMIN_ELEVATOR = { x: 41, y: 0.2, w: 5.8, h: 3.9 } as const;

function compressGaps(layout: MapLayout, k: number): MapLayout {
  // 같은 줄(y·높이 동일)의 주차면을 x 순으로 훑어, 틈이 ADMIN_RIGID_GAP 미만이면 같은 덩어리.
  const rows = new Map<string, MapStall[]>();
  for (const stall of layout.stalls) {
    const key = `${stall.y}|${stall.h}`;
    rows.set(key, [...(rows.get(key) ?? []), stall]);
  }

  const shiftByCode = new Map<string, number>();
  for (const row of rows.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    let clusterLeft = sorted[0].x;
    let clusterShift = clusterLeft * (1 - k);
    let prevRight = sorted[0].x + sorted[0].w;
    for (const [index, stall] of sorted.entries()) {
      const gap = stall.x - prevRight;
      if (index > 0 && gap >= ADMIN_RIGID_GAP) {
        clusterLeft = stall.x;
        // 앞 덩어리와의 틈이 ADMIN_MIN_GAP 밑으로 줄지 않게 이동량을 제한한다.
        clusterShift = Math.min(clusterLeft * (1 - k), clusterShift + gap - ADMIN_MIN_GAP);
      }
      shiftByCode.set(stall.code, clusterShift);
      prevRight = stall.x + stall.w;
    }
  }

  // 줄이 다른 주차면끼리도(세로로 겹치는 범위) 왼쪽 것보다 오른쪽 것이 더 많이 당겨져 서로
  // 파고들지 않도록, 오른쪽 이동량을 왼쪽 이동량 + 남은 틈 안으로 제한한다(수렴할 때까지 반복).
  for (let pass = 0; pass < 20; pass += 1) {
    let changed = false;
    for (const left of layout.stalls) {
      for (const right of layout.stalls) {
        const verticalOverlap = left.y < right.y + right.h && right.y < left.y + left.h;
        if (left === right || !verticalOverlap || right.x < left.x + left.w - 0.001) continue;
        const gap = right.x - (left.x + left.w);
        const limit = (shiftByCode.get(left.code) ?? 0) + Math.max(gap - ADMIN_MIN_GAP, 0);
        if ((shiftByCode.get(right.code) ?? 0) > limit) {
          shiftByCode.set(right.code, Math.max(limit, 0));
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // 비주차 요소는 x(와 방의 폭)를 그대로 비율 축소. 차량 출입구(entrance)는 슬로프 빗금 위에
  // 얹히는 자리라 줄이지 않는다.
  return {
    ...layout,
    elevator: layout.elevator && ADMIN_ELEVATOR,
    roomShape: layout.roomShape?.map(([x, y]) => [round2(x * k), y] as const),
    roomLabels: layout.roomLabels?.map((label) => ({ ...label, x: round2(label.x * k) })),
    rooms: layout.rooms.map((room) => ({
      ...room,
      x: round2(room.x * k),
      w: round2(room.w * k),
    })),
    stalls: layout.stalls.map((stall) => ({
      ...stall,
      x: round2(stall.x - (shiftByCode.get(stall.code) ?? 0)),
    })),
  };
}

/**
 * 슬로프 — 오른쪽 건물 외곽선에 딱 붙는 계단 모양 다각형. 위쪽 넓은 덩어리가 차량 출입구
 * 화살표 자리(x 69.25~75.8, y 5.85~11.7)를 감싸고, 아래쪽 좁은 덩어리(폭 고정)가 오른쪽 벽을
 * 따라 아래(y 22.5)로 길게 내려간다. 오른쪽 끝은 층마다 다른 건물 폭에서 0.3 안쪽이다.
 */
const SLOPE_TOP_Y = 5.85;
const SLOPE_STEP_Y = 11.7;
const SLOPE_BOTTOM_Y = 22.65;
const SLOPE_UPPER_LEFT_X = 68.65;
const SLOPE_LOWER_WIDTH = 6.12; // 직전 값(3.6)의 1.7배
const SLOPE_WALL_GAP = 0.3;

/**
 * `withEntrance`: 차량 출입구 화살표가 있는 층(B1)은 위쪽이 넓은 계단 모양이다. 출입구가 없는
 * 층(지상 1층)은 꺾일 이유가 없어서 넓은 덩어리 없이 좁은 직사각형 하나만 그린다 —
 * 상단(SLOPE_TOP_Y)은 그대로 두고 하단은 건물 아래 끝까지 내려온다.
 */
function buildSlope(
  building: { w: number; h: number },
  withEntrance: boolean,
  top: number = SLOPE_TOP_Y,
): MapSlope {
  const right = round2(building.w - SLOPE_WALL_GAP);
  const lowerLeft = round2(right - SLOPE_LOWER_WIDTH);
  if (!withEntrance) {
    const bottom = round2(building.h - SLOPE_WALL_GAP);
    return {
      points: [
        [lowerLeft, top],
        [right, top],
        [right, bottom],
        [lowerLeft, bottom],
      ],
    };
  }
  return {
    points: [
      [SLOPE_UPPER_LEFT_X, SLOPE_TOP_Y],
      [right, SLOPE_TOP_Y],
      [right, SLOPE_BOTTOM_Y],
      [lowerLeft, SLOPE_BOTTOM_Y],
      [lowerLeft, SLOPE_STEP_Y],
      [SLOPE_UPPER_LEFT_X, SLOPE_STEP_Y],
    ],
  };
}

/** B1 맨 아래 줄(B1-55~28) 주차면의 y — 이 값과 같은 y 를 가진 주차면이 그 줄이다. */
const B1_BOTTOM_ROW_Y = 30.93;

/**
 * 맨 아래 줄 주차면(y 가 `rowY` 인 것)만 `dy` 만큼 아래로 내려 검은 외곽선에 가깝게 붙인다.
 * x·크기는 그대로다(관리자 화면 도면 전용 — 원본 상수는 안 건드린다).
 */
function withBottomRowNearWall(layout: MapLayout, rowY: number, dy: number): MapLayout {
  return {
    ...layout,
    stalls: layout.stalls.map((stall) =>
      stall.y === rowY ? { ...stall, y: round2(stall.y + dy) } : stall,
    ),
  };
}

/**
 * B1 관리자 도면 정렬 규칙(모두 주차면 크기는 그대로, x 만 조정):
 * - B1-03·10·14·64·31 의 왼쪽 시작점을 B1_ALIGN_LEFT 에 맞춘다.
 * - B1-15~19 는 한 줄(같은 x)로 세운다.
 * - 아래 줄은 4면씩 붙은 묶음(55-52, 51-48 … 31-28)이고 묶음 사이 간격이 모두 같다.
 */
const B1_BOTTOM_GROUP_LEFT = 0.4;
/** 왼쪽 정렬 기준선 — 오른쪽 4면 덩어리(폭 9.6)가 슬로프 아래쪽 좁은 덩어리(왼쪽 72.93) 앞에서 끝나는 값. */
const B1_ALIGN_LEFT = 62.5;

function alignB1(layout: MapLayout): MapLayout {
  const x = new Map(layout.stalls.map((stall) => [stall.code, stall.x]));
  const left = B1_ALIGN_LEFT;
  const set = (code: string, value: number) => x.set(code, round2(value));
  const pitch = 2.4;

  // 위 줄: 03·02·01 을 기준선에 붙이고, 07~04 는 그 왼쪽에 같은 모양으로 이어 붙인다.
  ['B1-03', 'B1-02', 'B1-01'].forEach((code, i) => set(code, left + pitch * i));
  ['B1-04', 'B1-05', 'B1-06', 'B1-07'].forEach((code, i) => set(code, left - 0.5 - pitch * (i + 1)));
  ['B1-10', 'B1-09', 'B1-08'].forEach((code, i) => set(code, left + pitch * i));
  ['B1-14', 'B1-13', 'B1-12', 'B1-11'].forEach((code, i) => set(code, left + pitch * i));
  set('B1-64', left);
  set('B1-65', left + 5.3);

  const column = Math.max(...['B1-17', 'B1-18', 'B1-19'].map((code) => x.get(code)!));
  ['B1-15', 'B1-16', 'B1-17', 'B1-18', 'B1-19'].forEach((code) => set(code, column));

  const groupPitch = (left - B1_BOTTOM_GROUP_LEFT) / 6;
  for (let g = 0; g < 7; g += 1) {
    for (let i = 0; i < 4; i += 1) {
      const number = 55 - g * 4 - i;
      set(`B1-${number}`, B1_BOTTOM_GROUP_LEFT + groupPitch * g + pitch * i);
    }
  }

  return { ...layout, stalls: layout.stalls.map((stall) => ({ ...stall, x: x.get(stall.code)! })) };
}

/**
 * 지상 1층 관리자 도면 정리: 위쪽 작은 회색 박스와 관리실의 오른쪽 끝을 주차면 오른쪽 끝에 맞추고,
 * 관리실은 4번 주차면에 붙이되 5·6번 주차면과는 약간 띄운다. 슬로프 자리 맨 위에는 3번 주차면
 * 중간 높이까지 회색 구역을 하나 더 두고, 슬로프는 그 아래에서 시작한다.
 */
const GROUND_SLOPE_ZONE_BOTTOM = 13.1;
const GROUND_OFFICE_OVERHANG = 1.5;

function alignGround(layout: MapLayout): MapLayout {
  const stallRight = Math.max(...layout.stalls.filter((st) => st.rotated).map((st) => st.x + st.w));
  const stall04 = layout.stalls.find((st) => st.code === '1F-04')!;
  const lowerStallTop = Math.min(...layout.stalls.filter((st) => !st.rotated).map((st) => st.y));
  const slopePoints = buildSlope(GROUND_1F_BUILDING, false).points;
  const slopeLeft = slopePoints[0][0];
  const slopeRight = slopePoints[1][0];

  // 실제 도면처럼 주차면 덩어리와 작은 방·관리실을 슬로프 왼쪽 끝에 바로 붙인다(통째로 평행 이동).
  const dx = round2(slopeLeft - stallRight);
  const rooms = layout.rooms.map((room) => {
    if (room.x < 1) return room;
    const w = round2(stallRight - room.x);
    room = { ...room, x: round2(room.x + dx) };
    if (room.label === '관리실') {
      const top = stall04.y + stall04.h;
      // 관리실은 주차면보다 폭을 더 넓게(왼쪽으로 튀어나오게) 그린다. 오른쪽 끝은 그대로.
      const left = round2(Math.min(...layout.stalls.map((st) => st.x + dx)) - GROUND_OFFICE_OVERHANG);
      return { ...room, x: left, w: round2(room.x + w - left), y: top, h: round2(lowerStallTop - 1 - top) };
    }
    return { ...room, w };
  });
  rooms.push({
    x: slopeLeft,
    y: 0.1,
    w: round2(slopeRight - slopeLeft),
    h: round2(GROUND_SLOPE_ZONE_BOTTOM - 0.1),
  });
  return {
    ...layout,
    rooms,
    stalls: layout.stalls.map((st) => ({ ...st, x: round2(st.x + dx) })),
  };
}

export const ADMIN_LAYOUTS_BY_AREA_CODE: Readonly<Record<string, MapLayout>> = {
  MAIN: withBottomRowNearWall(
    {
      ...alignB1(compressGaps(B1_LAYOUT, ADMIN_GAP_SCALE)),
      slope: buildSlope(B1_BUILDING, true),
    },
    B1_BOTTOM_ROW_Y,
    0.32,
  ),
  GROUND: {
    ...alignGround(compressGaps(GROUND_1F_LAYOUT, ADMIN_GAP_SCALE)),
    gate: { x: 72.64, label: '주차장 진,출입구' },
    slope: buildSlope(GROUND_1F_BUILDING, false, GROUND_SLOPE_ZONE_BOTTOM),
  },
};

/**
 * 주차면 코드로 그 면이 속한 평면도를 찾는다.
 *
 * 신청자 조회 화면은 배정된 주차면 코드(highlightCode)만 알고 어느 층인지는 모르므로,
 * 이 함수로 도면을 자동으로 고른다.
 */
export function findLayoutForStallCode(code: string): MapLayout | null {
  for (const layout of Object.values(ADMIN_LAYOUTS_BY_AREA_CODE)) {
    if (layout.stalls.some((stall) => stall.code === code)) return layout;
  }
  return null;
}

/** 모든 도면에 등장하는 주차면 코드 전체 목록. 빌드 타임에 안내 이미지를 전부 미리 그릴 때 쓴다. */
export function allStallCodes(): string[] {
  return Object.values(LAYOUTS_BY_AREA_CODE).flatMap((layout) =>
    layout.stalls.map((stall) => stall.code),
  );
}
