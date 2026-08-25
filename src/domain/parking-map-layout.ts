/**
 * 주차 평면도 배치 (지하 1층 / 지상 1층).
 *
 * 사용자가 직접 PPT로 그려 전달한 두 장의 도면(지하 1층/지상 1층, 엘리베이터 위치를
 * 기준으로 맞춘 최종안)을 픽셀 좌표로 그대로 옮긴 값이다. 스크린샷에서 각 주차면·
 * 엘리베이터·설비실 사각형의 픽셀 경계 상자를 추출한 뒤, 건물 왼쪽 위 모서리를
 * 원점으로 하고 20px = 1 유닛으로 나눠 아래 좌표를 얻었다 — 실측 CAD 치수가 아니라
 * "이 도면 이미지와 정확히 같은 비율"을 재현하는 것이 목적이라 실제 mm 단위와는
 * 무관하다. 두 층의 엘리베이터가 도면상 같은 화면 위치(x:1060~1214, y:172~266px)에
 * 그려져 있어, 두 층의 원점만 각자 건물 왼쪽 위로 다시 잡아도 엘리베이터가 서로 어긋나지
 * 않는다.
 *
 * 단위는 전부 이 픽셀 기준 유닛이며 좌상단이 원점, 오른쪽이 차량 출입구 방향이다.
 * 주차면 좌표를 DB 에 두지 않는 이유는 요구사항(도면 좌표 컬럼 금지) 때문이며,
 * 배치가 바뀌는 일이 드물어 화면 상수로 두는 편이 다루기 쉽다.
 * 주차면은 `spaceCode` 로 DB 와 연결된다.
 *
 * 도면을 다시 맞춰야 하면: 새 스크린샷을 찍고, 노란 사각형(주차면)/파란 사각형
 * (엘리베이터·출입구)/회색 사각형(비주차 구역)의 픽셀 경계 상자를 다시 뽑아 아래 값만
 * 갱신하면 된다.
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
  /** 차량 출입구 화살표. 없는 층은 생략한다. */
  entrance?: { yTop: number; yBottom: number; xOut: number; label: string };
  elevator?: { x: number; y: number; w: number; h: number };
  rooms: readonly MapRoom[];
  stalls: readonly MapStall[];
};

const B1_BUILDING = { w: 78.2, h: 34.9 } as const;

/** 차량 출입구 (건물 우측, 지상 연결) */
const B1_ENTRANCE = { yTop: 6.3, yBottom: 13.2, xOut: 86.8, label: '차량 출입구' } as const;

/** 엘리베이터 (지상 연결) */
const B1_ELEVATOR = { x: 49.1, y: 0, w: 7.7, h: 4.7 } as const;

/**
 * 비주차 영역(설비실 등).
 * 도면상 두 개의 회색 사각형(위쪽 큰 방 + 아래쪽 좁은 방)을 그대로 옮겼다.
 */
const B1_ROOMS: readonly MapRoom[] = [
  { x: 0, y: 0.1, w: 56.9, h: 16.2 },
  { x: 0, y: 16.5, w: 34.3, h: 5.8 },
];

/** 지하 1층 주차면 55면. spaceCode 로 DB 의 주차면과 연결된다. */
const B1_STALLS: readonly MapStall[] = [
  { code: 'B1-07', x: 59.5, y: 0.2, w: 1.9, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-06', x: 61.6, y: 0.2, w: 1.9, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-05', x: 63.7, y: 0.2, w: 1.8, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-04', x: 65.7, y: 0.2, w: 1.9, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-03', x: 69.3, y: 0.2, w: 1.9, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-02', x: 71.4, y: 0.2, w: 1.8, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-01', x: 73.4, y: 0.2, w: 1.9, h: 4.4, rotated: false, block: '우상단' },
  { code: 'B1-15', x: 57.4, y: 12.1, w: 4.4, h: 1.8, rotated: true, block: '우측 세로' },
  { code: 'B1-10', x: 69.0, y: 13.6, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-09', x: 71.1, y: 13.6, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-08', x: 73.2, y: 13.6, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-16', x: 57.4, y: 14.1, w: 4.4, h: 1.9, rotated: true, block: '우측 세로' },
  { code: 'B1-17', x: 57.4, y: 16.2, w: 4.4, h: 1.9, rotated: true, block: '우측 세로' },
  { code: 'B1-14', x: 69.0, y: 18.1, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-13', x: 71.1, y: 18.1, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-12', x: 73.2, y: 18.1, w: 1.8, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-11', x: 75.2, y: 18.1, w: 1.9, h: 4.3, rotated: false, block: '우측 중단' },
  { code: 'B1-27', x: 35.7, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-26', x: 37.8, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-25', x: 39.9, y: 18.2, w: 1.8, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-24', x: 41.9, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-23', x: 46.6, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-22', x: 48.7, y: 18.2, w: 1.8, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-21', x: 50.7, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-20', x: 52.8, y: 18.2, w: 1.9, h: 4.3, rotated: false, block: '중앙' },
  { code: 'B1-18', x: 57.4, y: 18.3, w: 4.4, h: 1.9, rotated: true, block: '우측 세로' },
  { code: 'B1-19', x: 57.4, y: 20.4, w: 4.4, h: 1.9, rotated: true, block: '우측 세로' },
  { code: 'B1-55', x: 0.9, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-54', x: 3.0, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-53', x: 5.1, y: 30.7, w: 1.8, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-52', x: 7.1, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-51', x: 12.4, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-50', x: 14.5, y: 30.7, w: 1.8, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-49', x: 16.5, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-48', x: 18.6, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-47', x: 24.0, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-46', x: 26.1, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-45', x: 28.2, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-44', x: 30.3, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-43', x: 35.5, y: 30.7, w: 1.8, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-42', x: 37.5, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-41', x: 39.6, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-40', x: 41.7, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-39', x: 46.9, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-38', x: 49.0, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-37', x: 51.1, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-36', x: 53.2, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-35', x: 58.4, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-34', x: 60.5, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-33', x: 62.6, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-32', x: 64.7, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-31', x: 69.1, y: 30.7, w: 1.8, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-30', x: 71.1, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-29', x: 73.2, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
  { code: 'B1-28', x: 75.3, y: 30.7, w: 1.9, h: 4.2, rotated: false, block: '남측 장변' },
];

export const B1_LAYOUT: MapLayout = {
  building: B1_BUILDING,
  entrance: B1_ENTRANCE,
  elevator: B1_ELEVATOR,
  rooms: B1_ROOMS,
  stalls: B1_STALLS,
};

/**
 * 지상 1층 주차 구역.
 *
 * 일반 1면 + 장애인 3면. 사용자가 전달한 지상 1층 도면 스크린샷에서 픽셀 좌표를 그대로
 * 옮겼다 — 엘리베이터가 지하 1층과 도면상 같은 화면 위치에 그려져 있어(원점만 각자
 * 건물 기준으로 다시 잡음) 두 탭을 오갈 때 엘리베이터 위치가 어긋나지 않는다.
 * 엘리베이터 오른쪽·주차면 위아래의 회색 사각형(비주차 구역)도 도면 그대로 옮겼다.
 */
const GROUND_1F_BUILDING = { w: 75.5, h: 33.9 } as const;

const GROUND_1F_ELEVATOR = { x: 48.4, y: 0, w: 7.7, h: 4.7 } as const;

const GROUND_1F_ROOMS: readonly MapRoom[] = [
  { x: 0, y: 0, w: 65.8, h: 28.5 },
  { x: 72.2, y: 0.1, w: 3.3, h: 4.4 },
  { x: 70.5, y: 17.0, w: 5.0, h: 9.1 },
];

export const GROUND_1F_LAYOUT: MapLayout = {
  building: GROUND_1F_BUILDING,
  rooms: GROUND_1F_ROOMS,
  elevator: GROUND_1F_ELEVATOR,
  stalls: [
    { code: '1F-01', x: 71.3, y: 6.2, w: 4.2, h: 1.9, rotated: true, block: '지상' },
    { code: '1F-02', x: 71.3, y: 8.3, w: 4.2, h: 2.7, rotated: true, block: '지상' },
    { code: '1F-03', x: 71.3, y: 11.2, w: 4.2, h: 2.7, rotated: true, block: '지상' },
    { code: '1F-04', x: 71.3, y: 14.1, w: 4.2, h: 2.7, rotated: true, block: '지상' },
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
