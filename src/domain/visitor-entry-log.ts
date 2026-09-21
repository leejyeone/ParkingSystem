import { COMPANY_VEHICLE_LOG_PAGE_SIZE, paginateRows, renumberRowsByPage } from '@/domain/company-vehicle-log';
import { formatKstMonthDay, formatKstTime } from '@/lib/datetime';
import type { ReservationWithSpaces } from '@/services/reservation-service';

/**
 * "방문 차량 입출차 현황" 표 한 줄을 셀 값 배열로 나타낸 것 — `VISITOR_ENTRY_LOG_COLUMNS`와
 * 순서가 같다. 법인차량 운행 내역(`domain/company-vehicle-log.ts`)과 같은 양식을 쓰며,
 * 페이지 나누기(`paginateRows`/`renumberRowsByPage`/`COMPANY_VEHICLE_LOG_PAGE_SIZE`)도
 * 그대로 가져다 쓴다 — 완전히 범용적인 순수 함수라 이름 그대로 재사용한다.
 */
export type VisitorEntryLogCellRow = (string | number)[];

export { COMPANY_VEHICLE_LOG_PAGE_SIZE as VISITOR_ENTRY_LOG_PAGE_SIZE, paginateRows, renumberRowsByPage };

/** 방문 차량 입출차 현황 표 칸 순서. */
export const VISITOR_ENTRY_LOG_COLUMNS = [
  'No',
  '방문일자',
  '회사명',
  '방문자',
  '차량번호',
  '입차 시간',
  '출차 시간',
  '방문 목적',
  '배정 위치',
] as const;

/**
 * 방문일자 칸 — 방문 예정일(visitStartAt~visitEndAt). `formatRequestDateCell`(법인차량
 * 신청일자)과 같은 규칙: 자정을 넘으면 같은 달이면 'M/D~D', 달이 다르면 'M/D~M/D'.
 */
export function formatVisitDateCell(reservation: ReservationWithSpaces): string {
  const startLabel = formatKstMonthDay(reservation.visitStartAt);
  const endLabel = formatKstMonthDay(reservation.visitEndAt);
  if (startLabel === endLabel) return startLabel;

  const [startMonth] = startLabel.split('/');
  const [endMonth, endDay] = endLabel.split('/');
  return startMonth === endMonth ? `${startLabel}~${endDay}` : `${startLabel}~${endLabel}`;
}

/**
 * 입차/출차 시간 칸 — 법인차량의 "운행일시(예정)"와 달리 실제로 입차·출차한 시각을
 * 각각 보여준다. 이 표는 이미 완료(EXITED)된 예약만 다루므로 항상 값이 있다.
 */
export function formatEntryTimeCell(reservation: ReservationWithSpaces): string {
  return reservation.actualEntryAt ? formatKstTime(reservation.actualEntryAt) : '-';
}

export function formatExitTimeCell(reservation: ReservationWithSpaces): string {
  return reservation.actualExitAt ? formatKstTime(reservation.actualExitAt) : '-';
}

/** DB 조회 결과를 표/엑셀이 그대로 쓸 수 있는 셀 값 배열 목록으로 바꾼다. */
export function reservationsToLogRows(reservations: ReservationWithSpaces[]): VisitorEntryLogCellRow[] {
  return reservations.map((reservation, index) => [
    index + 1,
    formatVisitDateCell(reservation),
    reservation.companyOrBranchName,
    reservation.requesterName,
    reservation.vehicleNo,
    formatEntryTimeCell(reservation),
    formatExitTimeCell(reservation),
    reservation.visitPurpose ?? '-',
    reservation.assignedSpace?.spaceCode ?? '-',
  ]);
}
