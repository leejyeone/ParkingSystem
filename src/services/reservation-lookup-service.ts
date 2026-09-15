import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { issueAccessToken, LOOKUP_TOKEN_TTL_MINUTES } from '@/services/reservation-access-service';

/**
 * 로그인 회원이 자기 예약의 조회 화면으로 들어갈 접근 토큰을 발급한다.
 *
 * 마이페이지에서 예약 카드를 눌렀을 때 사용한다. 예약 조회와 같은 토큰 흐름을 재사용해
 * 회원 전용 조회/수정/취소 화면을 따로 만들지 않는다.
 *
 * 보안: 반드시 userId 로 소유권을 확인한다. 남의 예약 ID 를 넣어도 토큰이 나오지 않는다.
 */
export async function issueAccessTokenForOwnReservation(params: {
  reservationId: number;
  userId: number;
}): Promise<string> {
  const reservation = await prisma.parkingReservation.findFirst({
    where: { reservationId: params.reservationId, visitorUserId: params.userId },
    select: { reservationId: true, visitEndAt: true },
  });

  if (!reservation) {
    throw new NotFoundError('예약 정보를 찾을 수 없습니다.');
  }

  const { rawToken } = await issueAccessToken({
    reservationId: reservation.reservationId,
    visitEndAt: reservation.visitEndAt,
    expiresAt: new Date(Date.now() + LOOKUP_TOKEN_TTL_MINUTES * 60_000),
  });

  return rawToken;
}

/**
 * 직원이 "내 신청 내역"에서 예약 카드를 눌렀을 때 접근 토큰을 발급한다.
 * 본인 방문/대리 신청 모두 employeeUserId 로 연결되므로 조건은 하나로 충분하다.
 *
 * 보안: 반드시 employeeUserId 로 소유권을 확인한다. 남의 예약 ID 를 넣어도 토큰이 나오지 않는다.
 */
export async function issueAccessTokenForEmployeeReservation(params: {
  reservationId: number;
  employeeUserId: number;
}): Promise<string> {
  const reservation = await prisma.parkingReservation.findFirst({
    where: { reservationId: params.reservationId, employeeUserId: params.employeeUserId },
    select: { reservationId: true, visitEndAt: true },
  });

  if (!reservation) {
    throw new NotFoundError('예약 정보를 찾을 수 없습니다.');
  }

  const { rawToken } = await issueAccessToken({
    reservationId: reservation.reservationId,
    visitEndAt: reservation.visitEndAt,
    expiresAt: new Date(Date.now() + LOOKUP_TOKEN_TTL_MINUTES * 60_000),
  });

  return rawToken;
}
