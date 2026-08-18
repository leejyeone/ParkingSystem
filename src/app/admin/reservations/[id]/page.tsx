import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ReservationActionPanel } from '@/components/admin/reservation-action-panel';
import { Alert } from '@/components/ui/alert';
import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL, RESERVATION_STATUS_LABEL } from '@/domain/reservation-status';
import { requireAdminPage } from '@/lib/admin-page-guard';
import { formatKstDateTime, formatKstRange } from '@/lib/datetime';
import { formatPhone } from '@/lib/masking';
import { NotFoundError } from '@/lib/errors';
import { getRequestContext } from '@/lib/request-context';
import { getReservationDetailForAdmin } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { listAvailableSpaces } from '@/services/space-recommendation-service';
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
  const availableSpaces = await listAvailableSpaces({
    visitStartAt: reservation.visitStartAt,
    visitEndAt: reservation.visitEndAt,
    excludeReservationId: reservationId,
    doubleParkingEnabled: settings.doubleParkingEnabled,
  });

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
          {reservation.assignedSpace?.spaceType === 'DOUBLE' && (
            <span className="badge bg-orange-100 text-orange-800">⚠ 이중주차 배정</span>
          )}
        </div>
      </div>

      <Alert variant="warning" title="개인정보 열람 안내">
        이 화면에는 신청자의 개인정보 원문이 표시됩니다. 열람 이력은 감사 로그(audit_logs)에
        기록되며, 업무 목적 외 사용이나 외부 공유는 금지됩니다.
      </Alert>

      {/*
        grid-cols-1 을 명시해야 열이 minmax(0, 1fr) 이 되어 항목이 0까지 줄어든다.
        명시하지 않으면 내부 표(min-width 640px) 때문에 모바일에서 가로 스크롤이 생긴다.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="card">
            <div className="card-body">
              <h2 className="card-title">신청 정보</h2>
              <dl className="mt-3">
                <Row term="신청 구분" desc={REQUESTER_TYPE_LABEL[reservation.requesterType]} />
                <Row term="방문 상호/지사" desc={reservation.companyOrBranchName} />
                <Row term="부서명" desc={reservation.departmentName ?? '-'} />
                <Row term="성명" desc={reservation.requesterName} />
                <Row term="이메일" desc={reservation.requesterEmail} />
                <Row term="휴대전화" desc={formatPhone(reservation.requesterPhone)} />
                <Row term="차량번호" desc={reservation.vehicleNo} />
                <Row term="방문 목적" desc={reservation.visitPurpose ?? '-'} />
                <Row term="요청 메모" desc={reservation.requestMemo ?? '-'} />
                <Row
                  term="개인정보 동의"
                  desc={`${formatKstDateTime(reservation.privacyConsentAt)} 동의`}
                />
                <Row term="신청 일시" desc={formatKstDateTime(reservation.createdAt)} />
              </dl>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <h2 className="card-title">일정 및 주차 위치</h2>
              <dl className="mt-3">
                <Row
                  term="방문 예정"
                  desc={formatKstRange(reservation.visitStartAt, reservation.visitEndAt)}
                />
                <Row
                  term="실제 입차"
                  desc={
                    reservation.actualEntryAt ? formatKstDateTime(reservation.actualEntryAt) : '-'
                  }
                />
                <Row
                  term="실제 출차"
                  desc={
                    reservation.actualExitAt ? formatKstDateTime(reservation.actualExitAt) : '-'
                  }
                />
                <Row
                  term="추천 위치"
                  desc={reservation.recommendedSpace?.spaceCode ?? '추천 없음'}
                />
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
                {reservation.rejectionReason && (
                  <Row term="반려 사유" desc={reservation.rejectionReason} />
                )}
                {reservation.cancelReason && (
                  <Row term="취소 사유" desc={reservation.cancelReason} />
                )}
              </dl>
            </div>
          </section>

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
        </div>

        <div className="min-w-0 lg:col-span-1">
          <ReservationActionPanel
            reservationId={reservation.reservationId}
            reservationStatus={reservation.reservationStatus}
            recommendedSpaceId={reservation.recommendedSpaceId}
            recommendedSpaceCode={reservation.recommendedSpace?.spaceCode ?? null}
            assignedSpaceId={reservation.assignedSpaceId}
            availableSpaces={availableSpaces}
          />
        </div>
      </div>
    </main>
  );
}

function Row({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="definition-row">
      <dt className="definition-term">{term}</dt>
      <dd className="definition-desc">{desc}</dd>
    </div>
  );
}
