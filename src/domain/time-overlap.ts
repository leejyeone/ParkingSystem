/**
 * 시간 구간 중복 판정.
 *
 * 규칙(요구사항 5-1):
 *   existing.visit_start_at < new.visit_end_at
 *   AND existing.visit_end_at > new.visit_start_at
 *
 * 즉, 경계가 맞닿는 경우(앞 예약 종료 == 뒤 예약 시작)는 중복이 아니다.
 */
export function isTimeRangeOverlapping(
  existingStart: Date,
  existingEnd: Date,
  newStart: Date,
  newEnd: Date,
): boolean {
  return existingStart.getTime() < newEnd.getTime() && existingEnd.getTime() > newStart.getTime();
}

/** Prisma where 절에 그대로 사용할 수 있는 중복 조건 */
export function buildOverlapWhere(newStart: Date, newEnd: Date) {
  return {
    visitStartAt: { lt: newEnd },
    visitEndAt: { gt: newStart },
  };
}
