import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { issueAccessToken, LOOKUP_TOKEN_TTL_MINUTES } from '@/services/reservation-access-service';

/**
 * 예약번호로 예약을 찾아 조회용 접근 토큰을 발급한다.
 *
 * 이렇게 하면 조회·수정·취소 화면과 API 를 토큰 기반 흐름 하나로 유지할 수 있다.
 * (예약번호 조회 전용 화면을 따로 만들지 않는다)
 *
 * 보안
 *  - 발급 토큰의 유효시간을 LOOKUP_TOKEN_TTL_MINUTES 로 짧게 제한한다.
 *  - 존재하지 않는 예약번호와 잘못된 형식을 같은 메시지로 처리해 대입 공격의 단서를 주지 않는다.
 *  - 실제 대입 방어는 호출하는 Route Handler 의 레이트 리밋이 담당한다.
 */

/** 예약번호 표기 정규화: 공백 제거 + 대문자 (사용자가 소문자로 입력해도 조회되도록) */
export function normalizeReservationNo(input: string): string {
  return input.replace(/\s/g, '').toUpperCase();
}

export async function lookupByReservationNo(reservationNoInput: string): Promise<{
  reservationId: number;
  rawToken: string;
}> {
  const invalid = new NotFoundError(
    '해당 예약번호를 찾을 수 없습니다. 예약번호를 다시 확인해 주세요.',
  );

  const reservationNo = normalizeReservationNo(reservationNoInput);
  if (reservationNo.length < 8 || reservationNo.length > 30) {
    throw invalid;
  }

  const reservation = await prisma.parkingReservation.findUnique({
    where: { reservationNo },
    select: { reservationId: true, visitEndAt: true },
  });

  if (!reservation) {
    throw invalid;
  }

  const { rawToken } = await issueAccessToken({
    reservationId: reservation.reservationId,
    visitEndAt: reservation.visitEndAt,
    expiresAt: new Date(Date.now() + LOOKUP_TOKEN_TTL_MINUTES * 60_000),
  });

  return { reservationId: reservation.reservationId, rawToken };
}
