import { notFound, redirect } from 'next/navigation';

import { NotFoundError } from '@/lib/errors';
import { requireEmployeePage } from '@/lib/employee-page-guard';
import { issueAccessTokenForEmployeeReservation } from '@/services/reservation-lookup-service';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

/**
 * 직원의 "내 신청 내역"에서 예약 카드를 눌렀을 때 거쳐 가는 화면.
 *
 * 소유권을 확인한 뒤 짧은 수명의 접근 토큰을 발급하고 기존 예약 조회 화면으로 보낸다.
 * 직원 전용 조회 화면을 따로 만들지 않고 토큰 흐름 하나만 유지하기 위한 구조다.
 */
export default async function EmployeeReservationRedirectPage({ params }: PageProps) {
  const session = await requireEmployeePage('/employee/reservations');
  const { id } = await params;
  const reservationId = Number(id);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    notFound();
  }

  let rawToken: string;
  try {
    rawToken = await issueAccessTokenForEmployeeReservation({
      reservationId,
      employeeUserId: session.employeeUserId,
    });
  } catch (error) {
    // 남의 예약 ID 를 넣은 경우도 "없음" 으로 동일하게 처리한다.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  redirect(`/r/${encodeURIComponent(rawToken)}`);
}
