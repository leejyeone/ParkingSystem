'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { ReservationStatus, RequesterType } from '@prisma/client';

import { ClickableTableRow } from '@/components/admin/clickable-table-row';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';
import { REQUESTER_TYPE_LABEL } from '@/domain/reservation-status';
import { apiRequest } from '@/lib/client/api-client';

export type BulkRejectableItem = {
  reservationId: number;
  reservationNo: string;
  reservationStatus: ReservationStatus;
  requesterType: RequesterType;
  companyOrBranchName: string;
  requesterName: string;
  requesterEmail: string;
  vehicleNo: string;
  /** 서버에서 KST 로 미리 포맷한 문자열. 같은 날이면 종료는 시간만 표기된다. */
  visitRangeText: string;
  createdAtText: string;
};

type BulkRejectResult = {
  succeeded: number[];
  failed: { reservationId: number; message: string }[];
};

/**
 * 예약 목록 표 + 일괄 반려.
 *
 * 평소에는 행을 눌러 상세로 이동하는 기존 동작 그대로다. [일괄 반려]를 누르면
 * 선택 모드로 바뀌어 행 클릭이 이동 대신 체크박스 토글로 바뀐다 — 반려는
 * REQUESTED(승인 대기) 상태에서만 가능하므로 그 외 행은 선택할 수 없게 막는다.
 */
export function ReservationBulkRejectTable({
  items,
  basePath,
  returnTo,
  totalCount,
  pendingCount,
}: {
  items: BulkRejectableItem[];
  basePath: string;
  /** 상세에서 뒤로가기를 누르면 돌아올 URL(지금 목록의 필터·페이지를 그대로 담은 값) */
  returnTo: string;
  totalCount: number;
  /** 같은 검색 조건에서 아직 승인하지 않은 건수 */
  pendingCount: number;
}) {
  const router = useRouter();
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BulkRejectResult | null>(null);

  const detailHref = (reservationId: number) =>
    `${basePath}/${reservationId}?returnTo=${encodeURIComponent(returnTo)}`;

  const eligibleIds = items
    .filter((item) => item.reservationStatus === 'REQUESTED')
    .map((item) => item.reservationId);
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));

  function startBulkMode() {
    setBulkMode(true);
    setSelected(new Set());
    setReason('');
    setError(null);
    setLastResult(null);
  }

  function cancelBulkMode() {
    setBulkMode(false);
    setSelected(new Set());
    setReason('');
    setError(null);
  }

  function toggle(reservationId: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(reservationId)) next.delete(reservationId);
      else next.add(reservationId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  }

  async function handleSubmit() {
    if (selected.size === 0 || !reason.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const response = await apiRequest<BulkRejectResult>('/api/admin/reservations/bulk-reject', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [...selected],
        rejectionReason: reason.trim(),
      }),
    });

    setSubmitting(false);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    setLastResult(response.data);
    setBulkMode(false);
    setSelected(new Set());
    setReason('');
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink-muted flex flex-wrap items-center gap-2 text-sm font-bold">
          <span>전체 {totalCount}건</span>
          <span className={pendingCount > 0 ? 'text-amber-700' : 'text-ink-faint'}>
            · 미승인 {pendingCount}건
          </span>
        </p>
        {!bulkMode && (
          <button
            type="button"
            className="btn btn-secondary min-h-9 px-3 text-xs"
            onClick={startBulkMode}
          >
            일괄 반려
          </button>
        )}
      </div>

      {lastResult && (
        <div className="mt-3">
          <Alert
            variant={lastResult.failed.length === 0 ? 'success' : 'warning'}
            title="일괄 반려 처리 결과"
          >
            <p>{lastResult.succeeded.length}건 반려 완료.</p>
            {lastResult.failed.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {lastResult.failed.map((failure) => (
                  <li key={failure.reservationId}>
                    예약 ID {failure.reservationId}: {failure.message}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}

      {bulkMode && (
        <div className="border-line bg-surface-muted mt-3 rounded-lg border p-3">
          {error && (
            <div className="mb-3">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
          <p className="text-ink-muted text-sm font-bold">
            승인 대기 건만 선택할 수 있습니다. {selected.size}건 선택됨
          </p>
          <textarea
            className="input mt-2"
            rows={2}
            placeholder="선택한 예약 전체에 공통으로 적용할 반려 사유"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-danger min-h-9 px-3 text-xs"
              disabled={selected.size === 0 || !reason.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? '반려 처리 중…' : `선택한 ${selected.size}건 반려하기`}
            </button>
            <button
              type="button"
              className="btn btn-secondary min-h-9 px-3 text-xs"
              disabled={submitting}
              onClick={cancelBulkMode}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-ink-faint mt-4 text-sm">조건에 해당하는 예약이 없습니다.</p>
      ) : (
        <div className="table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                {bulkMode && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      className="accent-brand-700 size-4"
                      checked={allEligibleSelected}
                      onChange={toggleAll}
                      disabled={eligibleIds.length === 0}
                      aria-label="승인 대기 건 전체 선택"
                    />
                  </th>
                )}
                {/* 그룹웨어로 들어오면 창이 최대화되지 않아 화면이 좁으므로, 꼭 필요한
                    컬럼만 남긴다(이메일·신청일시 제외). 화면 너비와 무관하게 항상 이 구성이다. */}
                <th>상태</th>
                <th>구분</th>
                <th>회사명/사업장</th>
                <th>성명</th>
                <th>차량번호</th>
                <th>방문 시간</th>
                <th>예약번호</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const eligible = item.reservationStatus === 'REQUESTED';
                const rowCells = (
                  <>
                    {bulkMode && (
                      <td>
                        <input
                          type="checkbox"
                          className="accent-brand-700 size-4"
                          checked={selected.has(item.reservationId)}
                          disabled={!eligible}
                          onChange={() => toggle(item.reservationId)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${item.reservationNo} 선택`}
                        />
                      </td>
                    )}
                    <td>
                      <StatusBadge status={item.reservationStatus} />
                    </td>
                    <td>{REQUESTER_TYPE_LABEL[item.requesterType]}</td>
                    <td>
                      {bulkMode ? (
                        item.companyOrBranchName
                      ) : (
                        <Link
                          href={detailHref(item.reservationId)}
                          className="text-inherit no-underline focus-visible:underline"
                        >
                          {item.companyOrBranchName}
                        </Link>
                      )}
                    </td>
                    <td>{item.requesterName}</td>
                    <td className="font-mono text-xs">{item.vehicleNo}</td>
                    <td className="text-xs whitespace-nowrap">{item.visitRangeText}</td>
                    <td className="font-mono text-xs">{item.reservationNo.slice(-6)}</td>
                  </>
                );

                if (bulkMode) {
                  return (
                    <tr
                      key={item.reservationId}
                      data-testid="reservation-row"
                      className={`transition ${eligible ? 'hover:bg-surface-muted cursor-pointer' : 'opacity-50'}`}
                      onClick={() => eligible && toggle(item.reservationId)}
                    >
                      {rowCells}
                    </tr>
                  );
                }

                return (
                  <ClickableTableRow
                    key={item.reservationId}
                    href={detailHref(item.reservationId)}
                  >
                    {rowCells}
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
