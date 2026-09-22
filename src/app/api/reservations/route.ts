import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { formatKstRange } from '@/lib/datetime';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { createReservationSchema } from '@/lib/validation/reservation-schema';
import { createVisitorReservation } from '@/services/reservation-service';
import { getUserProfile, requireActiveUser } from '@/services/user-auth-service';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/reservations
 * 방문 예약 신청. 회원가입·로그인이 필수다(비로그인 신청은 막는다) — 로그인 회원 계정에
 * 예약을 연결해야 마이페이지 예약 내역/자동완성이 의미가 있고, 신원 확인 없는 신청을
 * 막기 위함이다. 화면(`/reservations/new`)에서도 미리 로그인 화면으로 리다이렉트하지만,
 * API를 직접 호출하는 우회 경로를 막기 위해 여기서도 다시 확인한다.
 *
 * 응답에는 예약번호와 일정만 포함하고, 접근 토큰 링크는 이메일로만 전달한다.
 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `reservation:create:${ipAddress ?? 'unknown'}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '방문 신청 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.',
    });

    const session = await requireActiveUser();

    const body = await request.json();
    const payload = createReservationSchema.parse(body);

    // 회사명/성명/이메일/차량번호/당사 담당자는 화면에서 수정할 수 없는 값이라 클라이언트가
    // 보내지 않는다 — 세션의 회원 프로필에서 서버가 직접 읽어 채운다.
    const profile = await getUserProfile(session.userId);
    if (!profile || !profile.vehicleNo || !profile.hostEmployeeUserId) {
      throw new ValidationError('먼저 마이페이지에서 차량번호와 담당자를 등록해 주세요.');
    }

    const { reservation } = await createVisitorReservation({
      visitorUserId: session.userId,
      employeeUserId: profile.hostEmployeeUserId,
      companyOrBranchName: profile.companyOrBranchName,
      requesterName: profile.name,
      requesterEmail: profile.email,
      vehicleNo: profile.vehicleNo,
      visitPurpose: payload.visitPurpose,
      requestMemo: payload.requestMemo,
      visitStartAt: payload.visitStartAt,
      visitEndAt: payload.visitEndAt,
      privacyConsent: payload.privacyConsent,
      securityPledgeConsent: payload.securityPledgeConsent,
      timingExceptionReason: payload.timingExceptionReason,
    });

    return apiSuccess(
      {
        reservationId: reservation.reservationId,
        reservationNo: reservation.reservationNo,
        reservationStatus: reservation.reservationStatus,
        companyOrBranchName: reservation.companyOrBranchName,
        requesterName: reservation.requesterName,
        vehicleNo: reservation.vehicleNo,
        visitStartAt: reservation.visitStartAt.toISOString(),
        visitEndAt: reservation.visitEndAt.toISOString(),
        visitRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
        emailNoticeSentTo: reservation.requesterEmail,
      },
      undefined,
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
