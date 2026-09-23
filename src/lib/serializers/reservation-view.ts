import { SpaceType } from '@prisma/client';

import {
  DISPLAY_STATUS_LABEL,
  resolveDisplayStatus,
  RESERVATION_STATUS_LABEL,
  REQUESTER_TYPE_LABEL,
  type DisplayReservationStatus,
} from '@/domain/reservation-status';
import { formatKstDateTime, formatKstHuman, formatKstRange, utcToZonedInput } from '@/lib/datetime';
import type { getReservationForRequester } from '@/services/reservation-service';

type RequesterReservation = Awaited<ReturnType<typeof getReservationForRequester>>;

/**
 * 신청자 본인에게 보여줄 예약 1건의 표현형.
 *
 * 값은 마스킹 없이 원문 그대로 노출한다.
 * 다른 예약자의 정보는 어떤 필드에도 포함되지 않는다.
 */
export type RequesterReservationView = {
  reservationNo: string;
  requesterType: string;
  requesterTypeLabel: string;
  /** 이 예약의 구분 — 직원 본인 방문 / 방문 예약(방문객 본인 신청·직원 대리 신청 모두 포함). */
  requesterKindLabel: string;
  /** DB 에 저장된 상태. 수정 가능 여부 등 판정에 쓴다. */
  reservationStatus: string;
  reservationStatusLabel: string;
  /** 화면에 보여줄 상태. 승인 완료 건은 방문 시간에 따라 사용 중/사용 완료가 된다. */
  displayStatus: DisplayReservationStatus;
  displayStatusLabel: string;
  companyOrBranchName: string;
  requesterName: string;
  requesterEmail: string;
  /** 당사 담당자(방문 예약에만 있을 수 있다 — 직원 본인 방문은 담당자가 곧 본인이라 null). */
  hostEmployeeText: string | null;
  vehicleNo: string;
  visitPurpose: string | null;
  requestMemo: string | null;
  visitStartAt: string;
  visitEndAt: string;
  visitStartInput: string;
  visitEndInput: string;
  visitRangeText: string;
  assignedSpaceCode: string | null;
  isDoubleParking: boolean;
  rejectionReason: string | null;
  cancelReason: string | null;
  changeDeadlineText: string;
  canChange: boolean;
  changeBlockedReason: string | null;
  /** 예외 신청 사유 원문. 신청 안 했으면 null. */
  timingExceptionReason: string | null;
  /** 방문객 본인이 신청한 건인지(직원 본인/대리 신청이면 false). 예외 신청 진입점 노출 여부에 쓴다. */
  isVisitorSelfRequest: boolean;
};

export function toRequesterReservationView(
  reservation: RequesterReservation,
  entryExitManagementEnabled: boolean,
): RequesterReservationView {
  const displayStatus = resolveDisplayStatus(reservation, entryExitManagementEnabled);

  return {
    reservationNo: reservation.reservationNo,
    requesterType: reservation.requesterType,
    requesterTypeLabel: REQUESTER_TYPE_LABEL[reservation.requesterType],
    requesterKindLabel: reservation.requesterType === 'EMPLOYEE' ? '내 방문신청' : '방문 예약',
    reservationStatus: reservation.reservationStatus,
    reservationStatusLabel: RESERVATION_STATUS_LABEL[reservation.reservationStatus],
    displayStatus,
    displayStatusLabel: DISPLAY_STATUS_LABEL[displayStatus],
    companyOrBranchName: reservation.companyOrBranchName,
    requesterName: reservation.requesterName,
    requesterEmail: reservation.requesterEmail,
    hostEmployeeText:
      reservation.requesterType === 'VISITOR' && reservation.employeeUser
        ? `${reservation.employeeUser.name} (${reservation.employeeUser.email})`
        : null,
    vehicleNo: reservation.vehicleNo,
    visitPurpose: reservation.visitPurpose,
    requestMemo: reservation.requestMemo,
    visitStartAt: formatKstDateTime(reservation.visitStartAt),
    visitEndAt: formatKstDateTime(reservation.visitEndAt),
    visitStartInput: utcToZonedInput(reservation.visitStartAt),
    visitEndInput: utcToZonedInput(reservation.visitEndAt),
    visitRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
    assignedSpaceCode: reservation.assignedSpace?.spaceCode ?? null,
    isDoubleParking: reservation.assignedSpace?.spaceType === SpaceType.DOUBLE,
    rejectionReason: reservation.rejectionReason,
    cancelReason: reservation.cancelReason,
    changeDeadlineText: formatKstHuman(reservation.changeDeadlineAt),
    canChange: reservation.canChange,
    changeBlockedReason: reservation.changeBlockedReason,
    timingExceptionReason: reservation.timingExceptionReason,
    isVisitorSelfRequest: reservation.visitorUserId !== null,
  };
}
