import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ReservationActionPanel } from '@/components/admin/reservation-action-panel';
import { RequesterInfoCard, ScheduleCard } from '@/components/admin/reservation-detail-cards';
import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL, RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
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

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

/**
 * 예약 상세 화면.
 * 개인정보 원문이 노출되므로 조회 시점에 audit_logs 에 열람 이력이 기록된다.
 */
export default async function AdminReservationDetailPage({ params, searchParams }: PageProps) {
  const session = await requireAdminPage('/admin/reservations');
  const { id } = await params;
  const reservationId = Number(id);

  /*
   * 예약 상세로 들어오는 경로가 여러 곳(일반 목록, 반복 예약 상세 등)이라 뒤로가기가
   * 항상 일반 목록으로 고정되면 반복 예약 쪽에서 들어왔을 때 원래 보던 화면으로 못
   * 돌아간다. 호출부가 실어 보낸 `returnTo`를 그대로 쓰되, `/admin/` 밖으로 나가는
   * 값(오픈 리다이렉트)은 신뢰하지 않고 기본 목록으로 폴백한다.
   */
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo =
    typeof rawReturnTo === 'string' && rawReturnTo.startsWith('/admin/')
      ? rawReturnTo
      : '/admin/reservations';
  const returnLabel = returnTo.startsWith('/admin/recurring-reservations')
    ? '← 반복 예약 상세'
    : returnTo.startsWith('/admin/logs/visitors')
      ? '← 입출차 내역'
      : '← 예약 목록';

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
        bufferMinutes: settings.spaceBufferMinutes,
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
          bufferMinutes: settings.spaceBufferMinutes,
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

  // 종료된 예약(반려/취소/출차/미방문)도 관리자가 내용을 정정할 수 있다 — 상태 전이가
  // 아니라 사후 기록 정정 목적이며, 이 경우 신청자에게 변경 안내 메일은 보내지 않는다
  // (updateReservationByAdmin 참고).
  const editable = true;
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
        <Link href={returnTo} className="text-brand-700 text-sm font-semibold">
          {returnLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-ink font-mono text-xl font-black sm:text-2xl">
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <RequesterInfoCard
            reservationId={reservation.reservationId}
            editable={editable}
            initial={editableFields}
            readOnly={{
              requesterType: reservation.requesterType,
              requesterTypeLabel: REQUESTER_TYPE_LABEL[reservation.requesterType],
              requesterEmail: reservation.requesterEmail,
              privacyConsentText: `${formatKstDateTime(reservation.privacyConsentAt)} 동의`,
              securityPledgeConsentText: reservation.securityPledgeConsentAt
                ? `${formatKstDateTime(reservation.securityPledgeConsentAt)} 동의`
                : null,
              createdAtText: formatKstDateTime(reservation.createdAt),
              employeeUserText:
                reservation.employeeUser && reservation.requesterType === 'VISITOR'
                  ? `${reservation.employeeUser.name} (${reservation.employeeUser.email})`
                  : null,
            }}
          />

          <ScheduleCard
            reservationId={reservation.reservationId}
            editable={editable}
            initial={editableFields}
            entryExitManagementEnabled={settings.entryExitManagementEnabled}
            actualEntryAt={
              reservation.actualEntryAt ? utcToZonedInput(reservation.actualEntryAt) : null
            }
            actualExitAt={
              reservation.actualExitAt ? utcToZonedInput(reservation.actualExitAt) : null
            }
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

        <div className="min-w-0">
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
                    <td className="text-xs whitespace-nowrap">
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
