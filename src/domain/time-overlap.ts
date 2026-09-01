/**
 * 시간 구간 중복 판정.
 *
 * 규칙(요구사항 5-1):
 *   existing.visit_start_at < new.visit_end_at
 *   AND existing.visit_end_at > new.visit_start_at
 *
 * 즉, 경계가 맞닿는 경우(앞 예약 종료 == 뒤 예약 시작)는 중복이 아니다.
 *
 * `bufferMinutes`(기본 0)를 넘기면 양쪽 구간을 그만큼 넓혀서 판정한다 — 같은 주차면에
 * 배정된 예약 사이에 최소 간격을 요구할 때 쓴다(주차면 버퍼 시간). 0이면 위 기존 규칙과
 * 완전히 동일하게 동작한다.
 */
export function isTimeRangeOverlapping(
  existingStart: Date,
  existingEnd: Date,
  newStart: Date,
  newEnd: Date,
  bufferMinutes = 0,
): boolean {
  const bufferMs = bufferMinutes * 60_000;
  return (
    existingStart.getTime() < newEnd.getTime() + bufferMs &&
    existingEnd.getTime() + bufferMs > newStart.getTime()
  );
}

/** Prisma where 절에 그대로 사용할 수 있는 중복 조건. bufferMinutes 는 위와 동일하다. */
export function buildOverlapWhere(newStart: Date, newEnd: Date, bufferMinutes = 0) {
  const bufferMs = bufferMinutes * 60_000;
  return {
    visitStartAt: { lt: new Date(newEnd.getTime() + bufferMs) },
    visitEndAt: { gt: new Date(newStart.getTime() - bufferMs) },
  };
}
