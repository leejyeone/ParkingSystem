import { formatKstMonthDay, formatKstTime } from '@/lib/datetime';
import type { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export type CompanyVehicleLogRow = Awaited<ReturnType<typeof listCompanyVehicleTrips>>[number];

/**
 * "차량 배차 신청 현황" 표 한 줄을 셀 값 배열로 나타낸 것 — `COMPANY_VEHICLE_LOG_COLUMNS`와
 * 순서가 같다. DB 조회 결과(`CompanyVehicleLogRow`) 대신 이 평평한 배열을 엑셀 빌더의
 * 입력으로 써서, 화면 표와 엑셀 출력이 항상 같은 값·같은 순서를 보여주게 한다.
 */
export type CompanyVehicleLogCellRow = (string | number)[];

/**
 * 법인차량 운행 대장의 "차량 배차 신청 현황" 표 칸 순서 — 화면과 엑셀 출력이 똑같은
 * 속성을 보여줘야 하므로, 두 쪽 다 이 목록과 아래 헬퍼 함수들을 그대로 재사용한다.
 * "신청자(운전자)"/"행선지(목적)"는 원본 종이 양식과 같이 줄바꿈으로 두 줄에 나눠 쓴다
 * (`\n` 기준 — 화면은 `<br/>`로, 엑셀은 wrapText로 각각 줄바꿈을 그린다).
 */
export const COMPANY_VEHICLE_LOG_COLUMNS = [
  'No',
  '신청일자',
  '신청부서',
  '신청자\n(운전자)',
  '배차차량(차종)',
  '운행일시(일정)',
  '행선지\n(목적)',
  '주행거리(km)',
  '진행상태',
] as const;

/** 계기판 두 값이 모두 있으면 그 차이, 없으면 수기 입력값 — schema.prisma 의 우선순위 그대로. */
export function resolveDistanceKm(trip: CompanyVehicleLogRow): number | null {
  if (trip.odometerStartKm !== null && trip.odometerEndKm !== null) {
    return trip.odometerEndKm - trip.odometerStartKm;
  }
  return trip.manualDistanceKm;
}

/**
 * 신청일자 칸 — 운행 예정일(requestStartAt~requestEndAt). 자정을 넘으면 종이 양식 예시
 * 그대로 같은 달이면 'M/D~D'(예 '9/15~16'), 달이 다르면 'M/D~M/D'로 표기한다.
 */
export function formatRequestDateCell(trip: CompanyVehicleLogRow): string {
  const startLabel = formatKstMonthDay(trip.requestStartAt);
  const endLabel = formatKstMonthDay(trip.requestEndAt);
  if (startLabel === endLabel) return startLabel;

  const [startMonth] = startLabel.split('/');
  const [endMonth, endDay] = endLabel.split('/');
  return startMonth === endMonth ? `${startLabel}~${endDay}` : `${startLabel}~${endLabel}`;
}

/** 배차차량(차종) 칸 — 차종이 없으면 차량번호로 대체. */
export function formatVehicleModelCell(trip: CompanyVehicleLogRow): string {
  const vehicle = trip.assignedVehicle;
  return vehicle?.vehicleModel ?? vehicle?.vehicleNo ?? '-';
}

/** 진행상태 칸 — 사용자 지시대로 차량번호를 그대로 보여준다. */
export function formatProgressStatusCell(trip: CompanyVehicleLogRow): string {
  return trip.assignedVehicle?.vehicleNo ?? '-';
}

/** 행선지(목적) 칸 — '선릉역(계약)'처럼 목적을 괄호로 붙인다. */
export function formatDestinationCell(trip: CompanyVehicleLogRow): string {
  return `${trip.destination}(${trip.reason})`;
}

/** 주행거리(km) 칸 — 값이 있으면 'km' 단위를 붙이고, 없으면 '-'로 보여준다. */
export function formatDistanceCell(trip: CompanyVehicleLogRow): string {
  const distanceKm = resolveDistanceKm(trip);
  return distanceKm !== null ? `${distanceKm}km` : '-';
}

/** DB 조회 결과를 표/엑셀이 그대로 쓸 수 있는 셀 값 배열 목록으로 바꾼다. */
export function tripsToLogRows(trips: CompanyVehicleLogRow[]): CompanyVehicleLogCellRow[] {
  return trips.map((trip, index) => [
    index + 1,
    formatRequestDateCell(trip),
    trip.employee.departmentName,
    trip.employee.name,
    formatVehicleModelCell(trip),
    `${formatKstTime(trip.requestStartAt)} ~ ${formatKstTime(trip.requestEndAt)}`,
    formatDestinationCell(trip),
    formatDistanceCell(trip),
    formatProgressStatusCell(trip),
  ]);
}
