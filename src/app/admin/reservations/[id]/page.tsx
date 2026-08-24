import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ReservationActionPanel } from '@/components/admin/reservation-action-panel';
import { RequesterInfoCard, ScheduleCard } from '@/components/admin/reservation-detail-cards';
import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import {
  isTerminalStatus,
  REQUESTER_TYPE_LABEL,
  RESERVATION_STATUS_LABEL,
} from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, formatKstRange, utcToZonedInput } from '@/lib/datetime';
import { NotFoundError } from '@/lib/errors';
import { getRequestContext } from '@/lib/request-context';
import { getCapacityUsage, getReservationDetailForAdmin } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { listAvailableSpaces, pickAvailableSpace } from '@/services/space-assignment-service';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '예약 상세' };

type PageProps = { params: Promise<{ id: string }> };

/**
 * 예약 상세 화면.
 * 개인정보 원문이 노출되므로 조회 시점에 audit_logs 에 열람 이력이 기록된다.
 */
export default async function AdminReservationDetailPage({ params }: PageProps) {
  const session = await requireAdminPage('/admin/reservations');
  const { id } = await params;
  const reservationId = Number(id);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    notFound();
  }

  const requestHeaders = await headers();

  let reservation;
  try {
    reservation = await getReservationDetailForAdmin(reservationId, {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(requestHeaders),
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const settings = await getSystemSettings();
  const showSpace = settings.spaceAssignmentEnabled;
  // 주차면 배정을 쓰지 않으면 배정 후보를 조회할 필요가 없다.
  const availableSpaces = showSpace
    ? await listAvailableSpaces({
        visitStartAt: reservation.visitStartAt,
        visitEndAt: reservation.visitEndAt,
        excludeReservationId: reservationId,
        doubleParkingEnabled: settings.doubleParkingEnabled,
      })
    : [];

  /*
   * 드롭다운 기본값은 화면을 열 때마다 계산한다.
   * 승인 처리도 같은 함수를 쓰므로, 화면에 보이는 기본값과 실제 배정 결과가 어긋나지 않는다.
   */
  const defaultSpace =
    showSpace && !reservation.assignedSpaceId
      ? await pickAvailableSpace({
          visitStartAt: reservation.visitStartAt,
          visitEndAt: reservation.visitEndAt,
          excludeReservationId: reservationId,
          doubleParkingEnabled: settings.doubleParkingEnabled,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
        })
      : null;

  // 배정을 쓰지 않을 때는 정원 잔여 대수를 대신 보여준다.
  const capacityUsage = showSpace
    ? null
    : await getCapacityUsage({
        visitStartAt: reservation.visitStartAt,
        visitEndAt: reservation.visitEndAt,
        excludeReservationId: reservationId,
      });

  // 종료된 예약(반려/취소/출차/미방문)은 내용을 바꿀 수 없다.
  const editable = !isTerminalStatus(reservation.reservationStatus);
  const editableFields = {
    companyOrBranchName: reservation.companyOrBranchName,
    requesterName: reservation.requesterName,
    vehicleNo: reservation.vehicleNo,
    visitPurpose: reservation.visitPurpose ?? '',
    requestMemo: reservation.requestMemo ?? '',
    visitStartAt: utcToZonedInput(reservation.visitStartAt),
    visitEndAt: utcToZonedInput(reservation.visitEndAt),
  };

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <Link href="/admin/reservations" className="text-brand-700 text-sm font-semibold">
          ← 예약 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-black text-slate-900 sm:text-2xl">
            {reservation.reservationNo}
          </h1>
          <StatusBadge status={reservation.reservationStatus} />
          {showSpace && reservation.assignedSpace?.spaceType === 'DOUBLE' && (
            <span className="badge bg-orange-100 text-orange-800">⚠ 이중주차 배정</span>
          )}
        </div>
      </div>

      {/* 되살리려면 '@/components/ui/alert' 의 Alert import 도 함께 복원할 것
      <Alert variant="warning" title="개인정보 열람 안내">
        이 화면에는 신청자의 개인정보 원문이 표시됩니다. 열람 이력은 감사 로그(audit_logs)에
        기록되며, 업무 목적 외 사용이나 외부 공유는 금지됩니다.
      </Alert> */}

      {/*
        grid-cols-1 을 명시해야 열이 minmax(0, 1fr) 이 되어 항목이 0까지 줄어든다.
        명시하지 않으면 내부 표(min-width 640px) 때문에 모바일에서 가로 스크롤이 생긴다.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <RequesterInfoCard
            reservationId={reservation.reservationId}
            editable={editable}
            initial={editableFields}
            readOnly={{
              requesterTypeLabel: REQUESTER_TYPE_LABEL[reservation.requesterType],
              requesterEmail: reservation.requesterEmail,
              privacyConsentText: `${formatKstDateTime(reservation.privacyConsentAt)} 동의`,
              createdAtText: formatKstDateTime(reservation.createdAt),
            }}
          />

          <ScheduleCard
            reservationId={reservation.reservationId}
            editable={editable}
            initial={editableFields}
            entryExitManagementEnabled={settings.entryExitManagementEnabled}
            readOnly={{
              title: showSpace ? '일정 및 주차 위치' : '일정',
              visitRangeText: formatKstRange(reservation.visitStartAt, reservation.visitEndAt),
              actualEntryText: reservation.actualEntryAt
                ? formatKstDateTime(reservation.actualEntryAt)
                : '-',
              actualExitText: reservation.actualExitAt
                ? formatKstDateTime(reservation.actualExitAt)
                : '-',
              spaceSection: showSpace ? (
                <div className="definition-row">
                  <dt className="definition-term">배정 위치</dt>
                  <dd className="definition-desc flex flex-wrap items-center gap-2">
                    {reservation.assignedSpace ? (
                      <>
                        <span className="font-mono font-bold">
                          {reservation.assignedSpace.spaceCode}
                        </span>
                        <SpaceTypeBadge spaceType={reservation.assignedSpace.spaceType} />
                      </>
                    ) : (
                      '미배정'
                    )}
                  </dd>
                </div>
              ) : null,
              rejectionReason: reservation.rejectionReason,
              cancelReason: reservation.cancelReason,
            }}
          />
        </div>

        <div className="min-w-0 lg:col-span-1">
          <ReservationActionPanel
            reservationId={reservation.reservationId}
            reservationNo={reservation.reservationNo}
            reservationStatus={reservation.reservationStatus}
            defaultSpaceId={defaultSpace?.spaceId ?? null}
            assignedSpaceId={reservation.assignedSpaceId}
            availableSpaces={availableSpaces}
            spaceAssignmentEnabled={showSpace}
            capacityUsage={capacityUsage}
            entryExitManagementEnabled={settings.entryExitManagementEnabled}
          />
        </div>
      </div>

      {/* 상태 변경 이력은 참고용이라 가장 아래에 둔다. */}
      <section className="card">
        <div className="card-body">
          <h2 className="card-title">상태 변경 이력</h2>
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>변경</th>
                  <th>주체</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {reservation.statusLogs.map((log) => (
                  <tr key={log.statusLogId}>
                    <td className="text-xs whitespace-nowrap">
                      {formatKstDateTime(log.createdAt)}
                    </td>
                    <td className="text-xs">
                      {log.previousStatus
                        ? `${RESERVATION_STATUS_LABEL[log.previousStatus]} → `
                        : ''}
                      <strong>{RESERVATION_STATUS_LABEL[log.currentStatus]}</strong>
                    </td>
                    <td className="text-xs">
                      {log.changedByType === 'ADMIN'
                        ? `관리자${log.adminName ? ` (${log.adminName})` : ''}`
                        : log.changedByType === 'REQUESTER'
                          ? '신청자'
                          : '시스템'}
                    </td>
                    <td className="text-xs">{log.changeReason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
