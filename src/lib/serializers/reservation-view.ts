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
  /** DB 에 저장된 상태. 수정 가능 여부 등 판정에 쓴다. */
  reservationStatus: string;
  reservationStatusLabel: string;
  /** 화면에 보여줄 상태. 승인 완료 건은 방문 시간에 따라 사용 중/사용 완료가 된다. */
  displayStatus: DisplayReservationStatus;
  displayStatusLabel: string;
  companyOrBranchName: string;
  requesterName: string;
  requesterEmail: string;
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
    reservationStatus: reservation.reservationStatus,
    reservationStatusLabel: RESERVATION_STATUS_LABEL[reservation.reservationStatus],
    displayStatus,
    displayStatusLabel: DISPLAY_STATUS_LABEL[displayStatus],
    companyOrBranchName: reservation.companyOrBranchName,
    requesterName: reservation.requesterName,
    requesterEmail: reservation.requesterEmail,
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
  };
}
