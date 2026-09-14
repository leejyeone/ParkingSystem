import type { ReservationStatus } from '@prisma/client';

import { formatKstRange } from '@/lib/datetime';
import { prisma } from '@/lib/prisma';

/**
 * 직원 홈 "최근 예약 현황"에 쓰는 통합 활동 내역.
 *
 * 방문 예약(본인/대리 신청)과 법인차량 신청은 완전히 다른 테이블이라, 화면에 한
 * 목록으로 섞어 보여주기 위해 이 서비스에서만 공통 모양으로 변환한다.
 */
export type EmployeeActivityItem = {
  kind: 'EMPLOYEE_VISIT' | 'PROXY_VISIT' | 'COMPANY_VEHICLE';
  kindLabel: string;
  requesterName: string;
  vehicleNo: string;
  dateRangeText: string;
  purpose: string;
  status: ReservationStatus;
  /** 법인차량 신청은 직원용 상세 화면이 없어 null(행 클릭 비활성). */
  href: string | null;
  sortAt: Date;
};

export async function listRecentActivityForEmployee(
  employeeUserId: number,
  limit: number,
): Promise<EmployeeActivityItem[]> {
  const [reservations, trips] = await Promise.all([
    prisma.parkingReservation.findMany({
      where: { employeeUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        reservationId: true,
        requesterType: true,
        requesterName: true,
        vehicleNo: true,
        visitStartAt: true,
        visitEndAt: true,
        visitPurpose: true,
        reservationStatus: true,
        createdAt: true,
      },
    }),
    prisma.companyVehicleTrip.findMany({
      where: { employeeUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        employee: { select: { name: true } },
        assignedVehicle: { select: { vehicleNo: true } },
      },
    }),
  ]);

  const items: EmployeeActivityItem[] = [
    ...reservations.map((reservation): EmployeeActivityItem => {
      const isProxy = reservation.requesterType === 'VISITOR';
      return {
        kind: isProxy ? 'PROXY_VISIT' : 'EMPLOYEE_VISIT',
        kindLabel: isProxy ? '방문객 대리 신청' : '내 방문신청',
        requesterName: reservation.requesterName,
        vehicleNo: reservation.vehicleNo,
        dateRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
        purpose: reservation.visitPurpose ?? '-',
        status: reservation.reservationStatus,
        href: `/employee/reservations/${reservation.reservationId}`,
        sortAt: reservation.createdAt,
      };
    }),
    ...trips.map((trip): EmployeeActivityItem => ({
      kind: 'COMPANY_VEHICLE',
      kindLabel: '법인차량예약',
      requesterName: trip.employee.name,
      vehicleNo: trip.assignedVehicle?.vehicleNo ?? '미배정',
      dateRangeText: formatKstRange(trip.requestStartAt, trip.requestEndAt),
      purpose: trip.reason,
      status: trip.tripStatus,
      href: null,
      sortAt: trip.createdAt,
    })),
  ];

  return items.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime()).slice(0, limit);
}
