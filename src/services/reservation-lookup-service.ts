import type { ReservationStatus } from '@prisma/client';

import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { normalizeVehicleNo } from '@/lib/vehicle';
import { issueAccessToken, LOOKUP_TOKEN_TTL_MINUTES } from '@/services/reservation-access-service';

/**
 * 예약자 성명 + 차량번호(AND 조건)로 예약을 검색한다.
 *
 * 예약번호 하나로 바로 접근 토큰을 발급하던 방식 대신, 신청자가 외우기 쉬운 정보(성명,
 * 차량번호)로 검색해 일치하는 예약을 모두 보여주고 그중 하나를 골라 들어가게 한다.
 *
 * 보안
 *  - 이 목록 조회 자체는 토큰을 발급하지 않는다. 목록에서 하나를 고르면
 *    issueAccessTokenByNameAndVehicle 로 다시 한 번 성명·차량번호를 검증해 토큰을 내준다 —
 *    화면에 노출된 reservationId 를 그대로 위조해 다른 사람 예약에 접근할 수 없도록 한다.
 *  - 대입 공격 방어는 호출하는 Route Handler 의 레이트 리밋이 담당한다.
 *  - 결과가 너무 많아 목록이 곧 개인정보 열람 창구가 되지 않도록 최근 순으로 개수를 제한한다.
 */

const MAX_LOOKUP_RESULTS = 20;

/**
 * reservationNo 는 여기서 화면에 노출하지 않는다 — 이제 예약번호는 DB 식별용
 * unique 값일 뿐, 사용자가 알아야 할 정보가 아니다. 목록에서는 방문 일정으로 구분하고,
 * 상세 진입은 reservationId(내부용)로만 처리한다.
 */
export type ReservationLookupResult = {
  reservationId: number;
  visitStartAt: Date;
  visitEndAt: Date;
  reservationStatus: ReservationStatus;
};

export async function lookupByNameAndVehicle(params: {
  requesterName: string;
  vehicleNo: string;
}): Promise<ReservationLookupResult[]> {
  const requesterName = params.requesterName.trim();
  const vehicleNo = normalizeVehicleNo(params.vehicleNo);

  return prisma.parkingReservation.findMany({
    where: { requesterName, vehicleNo },
    select: {
      reservationId: true,
      visitStartAt: true,
      visitEndAt: true,
      reservationStatus: true,
    },
    orderBy: { visitStartAt: 'desc' },
    take: MAX_LOOKUP_RESULTS,
  });
}

/**
 * 조회 목록에서 고른 예약의 접근 토큰을 발급한다.
 *
 * reservationId 만으로 토큰을 내주지 않고, 성명·차량번호가 그 예약과 실제로 일치하는지
 * 다시 확인한다 — 목록 API 가 돌려준 reservationId 를 다른 값으로 바꿔 보내는 시도를 막는다.
 */
export async function issueAccessTokenByNameAndVehicle(params: {
  reservationId: number;
  requesterName: string;
  vehicleNo: string;
}): Promise<string> {
  const invalid = new NotFoundError('예약 정보를 찾을 수 없습니다. 처음부터 다시 조회해 주세요.');

  const reservation = await prisma.parkingReservation.findFirst({
    where: {
      reservationId: params.reservationId,
      requesterName: params.requesterName.trim(),
      vehicleNo: normalizeVehicleNo(params.vehicleNo),
    },
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

  return rawToken;
}

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
