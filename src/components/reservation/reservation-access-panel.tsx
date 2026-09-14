'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { STATUS_BADGE_CLASS } from '@/components/ui/status-badge';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';
import type { RequesterReservationView } from '@/lib/serializers/reservation-view';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Mode = 'view' | 'edit' | 'cancel';

type Props = {
  token: string;
  /** "처음으로" 링크가 갈 곳. 직원 로그인 상태면 직원 홈, 그 외에는 방문객 메인. */
  homeHref: string;
  initialReservation: RequesterReservationView;
  settings: {
    reservationMinLeadMinutes: number;
    maxReservationHours: number;
    /** 주차면 배정 사용 여부. false 면 주차 위치 관련 안내를 모두 감춘다. */
    spaceAssignmentEnabled: boolean;
  };
};

export function ReservationAccessPanel({ token, homeHref, initialReservation, settings }: Props) {
  const [reservation, setReservation] = useState(initialReservation);
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {notice && (
        <Alert variant="success" title="처리되었습니다">
          {notice}
        </Alert>
      )}

      <section className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-500">예약번호</p>
              <p className="font-mono text-lg font-black text-slate-900">
                {reservation.reservationNo}
              </p>
            </div>
            {/* 승인 완료 건은 방문 시간이 지나면 사용 중 / 사용 완료로 표시된다. */}
            <span className={`badge ${STATUS_BADGE_CLASS[reservation.displayStatus]}`}>
              {reservation.displayStatusLabel}
            </span>
          </div>

          {reservation.reservationStatus === 'REJECTED' && reservation.rejectionReason && (
            <div className="mt-4">
              <Alert variant="error" title="반려 사유">
                {reservation.rejectionReason}
              </Alert>
            </div>
          )}

          {reservation.reservationStatus === 'CANCELLED' && reservation.cancelReason && (
            <div className="mt-4">
              <Alert variant="warning" title="취소 사유">
                {reservation.cancelReason}
              </Alert>
            </div>
          )}

          {reservation.isDoubleParking && (
            <div className="mt-4">
              <Alert variant="warning" title="이중주차 위치로 배정되었습니다">
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>앞 차량 출차를 위해 차량 이동 요청을 받으실 수 있습니다.</li>
                  <li>차량 이동 요청은 현장 안내 방송 또는 안내 데스크를 통해 전달됩니다.</li>
                  <li>기어는 중립(N), 주차 브레이크는 해제해 주세요.</li>
                </ul>
              </Alert>
            </div>
          )}

          <dl className="mt-4">
            <Row term="신청 구분" desc={reservation.requesterTypeLabel} />
            <Row
              term={reservation.requesterType === 'EMPLOYEE' ? '사업장' : '회사명'}
              desc={reservation.companyOrBranchName}
            />
            <Row term="성명" desc={reservation.requesterName} />
            <Row term="이메일" desc={reservation.requesterEmail} />
            <Row term="차량번호" desc={reservation.vehicleNo} />
            <Row term="방문 시간" desc={reservation.visitRangeText} />
            {settings.spaceAssignmentEnabled && (
              <Row
                term="배정 위치"
                desc={
                  reservation.assignedSpaceCode
                    ? `${reservation.assignedSpaceCode}${reservation.isDoubleParking ? ' (이중주차)' : ''}`
                    : '승인 후 배정됩니다'
                }
              />
            )}
            {reservation.visitPurpose && <Row term="방문 목적" desc={reservation.visitPurpose} />}
            {reservation.requestMemo && <Row term="요청 메모" desc={reservation.requestMemo} />}
            {/* 승인 대기 상태에서만 의미가 있다. 승인/반려/취소된 예약은 더 이상 수정 대상이 아니다. */}
            {reservation.reservationStatus === 'REQUESTED' && (
              <Row term="수정·취소 마감" desc={reservation.changeDeadlineText} />
            )}
          </dl>
        </div>
      </section>

      {mode === 'view' && (
        <section className="card">
          <div className="card-body">
            {reservation.canChange ? (
              <>
                <p className="text-sm text-slate-600">
                  방문 시작 {settings.reservationMinLeadMinutes}분 전(
                  {reservation.changeDeadlineText})까지 수정 또는 취소할 수 있습니다.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}>
                    예약 수정하기
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setMode('cancel')}
                  >
                    예약 취소하기
                  </button>
                </div>
              </>
            ) : (
              <Alert variant="warning" title="수정·취소할 수 없습니다">
                {reservation.changeBlockedReason}
              </Alert>
            )}
          </div>
        </section>
      )}

      {mode === 'edit' && (
        <EditForm
          token={token}
          reservation={reservation}
          settings={settings}
          onCancel={() => setMode('view')}
          onSuccess={(updated) => {
            setReservation(updated);
            setMode('view');
            setNotice(
              '예약이 변경되었습니다. 변경된 예약은 다시 관리자 승인을 받아야 하며, 기존 배정 위치는 해제되었습니다.',
            );
          }}
        />
      )}

      {mode === 'cancel' && (
        <CancelForm
          token={token}
          spaceAssignmentEnabled={settings.spaceAssignmentEnabled}
          onBack={() => setMode('view')}
          onSuccess={(updated) => {
            setReservation(updated);
            setMode('view');
            setNotice('예약이 취소되었습니다. 취소 안내 메일을 발송했습니다.');
          }}
        />
      )}

      <Link href={homeHref} className="btn btn-secondary w-full">
        처음으로
      </Link>
    </div>
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

function EditForm({
  token,
  reservation,
  settings,
  onCancel,
  onSuccess,
}: {
  token: string;
  reservation: RequesterReservationView;
  settings: {
    reservationMinLeadMinutes: number;
    maxReservationHours: number;
    /** 주차면 배정 사용 여부. false 면 주차 위치 관련 안내를 모두 감춘다. */
    spaceAssignmentEnabled: boolean;
  };
  onCancel: () => void;
  onSuccess: (updated: RequesterReservationView) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    companyOrBranchName: reservation.companyOrBranchName,
    requesterName: reservation.requesterName,
    vehicleNo: reservation.vehicleNo,
    visitPurpose: reservation.visitPurpose ?? '',
    requestMemo: reservation.requestMemo ?? '',
    visitStartAt: reservation.visitStartInput,
    visitEndAt: reservation.visitEndInput,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    update('vehicleNo', normalizeVehicleNo(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest<RequesterReservationView>(
      `/api/reservations/access/${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          visitPurpose: form.visitPurpose,
          requestMemo: form.requestMemo || null,
        }),
      },
    );

    if (response.ok) {
      setSubmitting(false);
      onSuccess(response.data);
      return;
    }

    // 토큰이 만료·무효화됐다면 이 화면(폼)에 오류를 띄우는 대신, 페이지를 다시
    // 렌더링해 이미 있는 만료 안내 화면(InvalidTokenView)으로 자연스럽게 넘어가게 한다.
    if (response.error.code === 'NOT_FOUND') {
      router.refresh();
      return;
    }

    setSubmitting(false);
    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-5">
        <h2 className="card-title">예약 수정</h2>

        <Alert variant="warning" title="수정 시 유의사항">
          수정하면 예약 상태가 <strong>승인 대기</strong>로 되돌아갑니다.
          {settings.spaceAssignmentEnabled ? ' 기존 배정 주차 위치가 해제됩니다.' : ''} 이메일
          주소는 변경할 수 없습니다.
        </Alert>

        {formError && <Alert variant="error">{formError.message}</Alert>}

        <FormField
          label="회사명"
          htmlFor="edit-company"
          required
          errors={fieldErrors.companyOrBranchName}
        >
          <input
            id="edit-company"
            className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
            value={form.companyOrBranchName}
            onChange={(event) => update('companyOrBranchName', event.target.value)}
            maxLength={100}
          />
        </FormField>

        <FormField label="성명" htmlFor="edit-name" required errors={fieldErrors.requesterName}>
          <input
            id="edit-name"
            className={inputClassName(Boolean(fieldErrors.requesterName))}
            value={form.requesterName}
            onChange={(event) => update('requesterName', event.target.value)}
            maxLength={50}
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="edit-vehicle"
          required
          hint="공백과 하이픈은 자동으로 정리됩니다."
          errors={fieldErrors.vehicleNo}
        >
          <input
            id="edit-vehicle"
            className={inputClassName(Boolean(fieldErrors.vehicleNo))}
            value={form.vehicleNo}
            onChange={handleVehicleNoChange}
            maxLength={20}
          />
        </FormField>

        <FormField
          label="입차 예정 시간"
          htmlFor="edit-start"
          required
          hint={`현재 시각 기준 ${settings.reservationMinLeadMinutes}분 이후로 선택해 주세요.`}
          errors={fieldErrors.visitStartAt}
        >
          <input
            id="edit-start"
            type="datetime-local"
            className={inputClassName(Boolean(fieldErrors.visitStartAt))}
            value={form.visitStartAt}
            onChange={(event) => update('visitStartAt', event.target.value)}
          />
        </FormField>

        <FormField
          label="출차 예정 시간"
          htmlFor="edit-end"
          required
          hint={`같은 날짜 내에서 최대 ${settings.maxReservationHours}시간까지 신청할 수 있습니다.`}
          errors={fieldErrors.visitEndAt}
        >
          <input
            id="edit-end"
            type="datetime-local"
            className={inputClassName(Boolean(fieldErrors.visitEndAt))}
            value={form.visitEndAt}
            onChange={(event) => update('visitEndAt', event.target.value)}
          />
        </FormField>

        <FormField
          label="방문 목적"
          htmlFor="edit-purpose"
          required
          errors={fieldErrors.visitPurpose}
        >
          <input
            id="edit-purpose"
            className={inputClassName(Boolean(fieldErrors.visitPurpose))}
            value={form.visitPurpose}
            onChange={(event) => update('visitPurpose', event.target.value)}
            maxLength={200}
          />
        </FormField>

        <FormField label="요청 메모" htmlFor="edit-memo" errors={fieldErrors.requestMemo}>
          <textarea
            id="edit-memo"
            rows={3}
            className={inputClassName(Boolean(fieldErrors.requestMemo))}
            value={form.requestMemo}
            onChange={(event) => update('requestMemo', event.target.value)}
            maxLength={1000}
          />
        </FormField>

        <div className="sticky-actions grid gap-2 sm:grid-cols-2">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '저장 중…' : '수정 내용 저장'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            되돌아가기
          </button>
        </div>
      </div>
    </form>
  );
}

function CancelForm({
  token,
  spaceAssignmentEnabled,
  onBack,
  onSuccess,
}: {
  token: string;
  spaceAssignmentEnabled: boolean;
  onBack: () => void;
  onSuccess: (updated: RequesterReservationView) => void;
}) {
  const router = useRouter();
  const [cancelReason, setCancelReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest<RequesterReservationView>(
      `/api/reservations/access/${encodeURIComponent(token)}/cancel`,
      { method: 'POST', body: JSON.stringify({ cancelReason }) },
    );

    if (response.ok) {
      setSubmitting(false);
      onSuccess(response.data);
      return;
    }

    // 토큰이 만료·무효화됐다면 이 화면(폼)에 오류를 띄우는 대신, 페이지를 다시
    // 렌더링해 이미 있는 만료 안내 화면(InvalidTokenView)으로 자연스럽게 넘어가게 한다.
    if (response.error.code === 'NOT_FOUND') {
      router.refresh();
      return;
    }

    setSubmitting(false);
    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-4">
        <h2 className="card-title">예약 취소</h2>
        <Alert variant="warning">
          {spaceAssignmentEnabled
            ? '취소하면 배정된 주차 위치가 해제되며 되돌릴 수 없습니다.'
            : '취소하면 되돌릴 수 없습니다.'}{' '}
          다시 방문하시려면 새로 신청해 주세요.
        </Alert>

        {formError && <Alert variant="error">{formError.message}</Alert>}

        <FormField
          label="취소 사유"
          htmlFor="cancel-reason"
          required
          errors={fieldErrors.cancelReason}
        >
          <textarea
            id="cancel-reason"
            rows={3}
            className={inputClassName(Boolean(fieldErrors.cancelReason))}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="예) 방문 일정 취소"
            maxLength={500}
          />
        </FormField>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="submit" className="btn btn-danger" disabled={submitting}>
            {submitting ? '취소 처리 중…' : '예약 취소 확정'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            disabled={submitting}
          >
            되돌아가기
          </button>
        </div>
      </div>
    </form>
  );
}
