'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 법인차량 신청 상세의 인라인 수정 카드. `reservation-detail-cards.tsx`(방문 예약 상세)와
 * 같은 패턴 — 카드 우상단 [수정하기]를 누르면 그 카드만 편집 모드로 바뀐다.
 *
 * 행선지/사유/운행시간은 PATCH /api/admin/company-vehicle-trips/[id] 로, 주행거리는
 * POST /api/admin/company-vehicle-trips/[id]/mileage 로 따로 저장하지만, 두 카드 중
 * 어느 쪽에서 저장하든 현재 폼 전체를 두 요청에 함께 실어 보낸다(방문 예약이 "PUT 은
 * 전체를 받으니 어느 카드에서 저장하든 EditableFields 전체를 보낸다"는 것과 같은 이유).
 */

export type EditableFields = {
  destination: string;
  reason: string;
  /** 'yyyy-MM-ddTHH:mm' (Asia/Seoul 기준) */
  requestStartAt: string;
  requestEndAt: string;
  /** 입력 필드 바인딩용 문자열. 빈 문자열이면 미기록. */
  odometerStartKm: string;
  odometerEndKm: string;
};

type SaveState = {
  pending: boolean;
  fieldErrors: Record<string, string[]>;
  error: string | null;
};

const IDLE: SaveState = { pending: false, fieldErrors: {}, error: null };

function useTripEdit(tripId: number, initial: EditableFields) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(initial);
  const [state, setState] = useState<SaveState>(IDLE);
  const [saved, setSaved] = useState(false);

  function update(key: keyof EditableFields, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  function cancel() {
    setForm(initial);
    setState(IDLE);
    setEditing(false);
  }

  async function save() {
    setState({ pending: true, fieldErrors: {}, error: null });

    const [detailResponse, mileageResponse] = await Promise.all([
      apiRequest(`/api/admin/company-vehicle-trips/${tripId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          destination: form.destination,
          reason: form.reason,
          requestStartAt: form.requestStartAt,
          requestEndAt: form.requestEndAt,
        }),
      }),
      apiRequest(`/api/admin/company-vehicle-trips/${tripId}/mileage`, {
        method: 'POST',
        body: JSON.stringify({
          odometerStartKm: form.odometerStartKm,
          odometerEndKm: form.odometerEndKm,
        }),
      }),
    ]);

    if (detailResponse.ok && mileageResponse.ok) {
      setState(IDLE);
      setEditing(false);
      setSaved(true);
      router.refresh();
      return;
    }

    setState({
      pending: false,
      fieldErrors: {
        ...(!detailResponse.ok ? (detailResponse.error.fieldErrors ?? {}) : {}),
        ...(!mileageResponse.ok ? (mileageResponse.error.fieldErrors ?? {}) : {}),
      },
      error: [
        !detailResponse.ok ? detailResponse.error.message : '',
        !mileageResponse.ok ? mileageResponse.error.message : '',
      ]
        .filter(Boolean)
        .join(' / '),
    });
  }

  return { editing, setEditing: startEditing, form, update, state, saved, save, cancel };
}

function CardShell({
  title,
  editable,
  editing,
  pending,
  error,
  saved,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  title: string;
  editable: boolean;
  editing: boolean;
  pending: boolean;
  error: string | null;
  saved: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">{title}</h2>
          {editable &&
            (editing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={onSave}
                >
                  {pending ? '저장 중…' : '저장'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={onCancel}
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                onClick={onEdit}
              >
                수정하기
              </button>
            ))}
        </div>

        {error && (
          <div className="mt-3">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {saved && !editing && (
          <div className="mt-3">
            <Alert variant="success">저장되었습니다.</Alert>
          </div>
        )}

        {children}
      </div>
    </section>
  );
}

function Row({ term, desc }: { term: string; desc: ReactNode }) {
  return (
    <div className="definition-row">
      <dt className="definition-term">{term}</dt>
      <dd className="definition-desc">{desc}</dd>
    </div>
  );
}

/** 신청 정보 카드 — 행선지·사유를 수정한다. */
export function CompanyVehicleTripInfoCard({
  tripId,
  editable,
  initial,
  readOnly,
}: {
  tripId: number;
  editable: boolean;
  initial: EditableFields;
  readOnly: {
    employeeText: string;
    employeeEmail: string;
    createdAtText: string;
  };
}) {
  const { editing, setEditing, form, update, state, saved, save, cancel } = useTripEdit(
    tripId,
    initial,
  );

  return (
    <CardShell
      title="신청 정보"
      editable={editable}
      editing={editing}
      pending={state.pending}
      error={state.error}
      saved={saved}
      onEdit={setEditing}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          <FormField
            label="행선지"
            htmlFor="edit-destination"
            required
            errors={state.fieldErrors.destination}
          >
            <input
              id="edit-destination"
              className={inputClassName(Boolean(state.fieldErrors.destination))}
              value={form.destination}
              onChange={(event) => update('destination', event.target.value)}
              maxLength={200}
            />
          </FormField>
          <FormField label="사유" htmlFor="edit-reason" required errors={state.fieldErrors.reason}>
            <textarea
              id="edit-reason"
              rows={3}
              className={inputClassName(Boolean(state.fieldErrors.reason))}
              value={form.reason}
              onChange={(event) => update('reason', event.target.value)}
              maxLength={500}
            />
          </FormField>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="신청 직원" desc={readOnly.employeeText} />
          <Row term="이메일" desc={readOnly.employeeEmail} />
          <Row term="행선지" desc={initial.destination} />
          <Row term="사유" desc={<span className="whitespace-pre-wrap">{initial.reason}</span>} />
          <Row term="신청 일시" desc={readOnly.createdAtText} />
        </dl>
      )}
    </CardShell>
  );
}

/** 운행 일정 카드 — 운행 요청 시간과 주행거리를 수정한다. */
export function CompanyVehicleTripScheduleCard({
  tripId,
  editable,
  initial,
  readOnly,
}: {
  tripId: number;
  editable: boolean;
  initial: EditableFields;
  readOnly: {
    visitRangeText: string;
    assignedVehicleText: string;
    actualEntryText: string;
    actualExitText: string;
    rejectionReason: string | null;
    cancelReason: string | null;
  };
}) {
  const { editing, setEditing, form, update, state, saved, save, cancel } = useTripEdit(
    tripId,
    initial,
  );

  const mileageText =
    initial.odometerStartKm !== '' && initial.odometerEndKm !== ''
      ? `${Number(initial.odometerEndKm) - Number(initial.odometerStartKm)}km (${initial.odometerStartKm} → ${initial.odometerEndKm})`
      : '-';

  return (
    <CardShell
      title="운행 일정"
      editable={editable}
      editing={editing}
      pending={state.pending}
      error={state.error}
      saved={saved}
      onEdit={setEditing}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="운행 시작 예정 시간"
              htmlFor="edit-start"
              required
              errors={state.fieldErrors.requestStartAt}
            >
              <input
                id="edit-start"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.requestStartAt))}
                value={form.requestStartAt}
                onChange={(event) => update('requestStartAt', event.target.value)}
              />
            </FormField>
            <FormField
              label="운행 종료 예정 시간"
              htmlFor="edit-end"
              required
              errors={state.fieldErrors.requestEndAt}
            >
              <input
                id="edit-end"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.requestEndAt))}
                value={form.requestEndAt}
                onChange={(event) => update('requestEndAt', event.target.value)}
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="출발 전 계기판(km)"
              htmlFor="edit-odometer-start"
              errors={state.fieldErrors.odometerStartKm}
            >
              <input
                id="edit-odometer-start"
                type="number"
                min={0}
                inputMode="numeric"
                className={inputClassName(Boolean(state.fieldErrors.odometerStartKm))}
                value={form.odometerStartKm}
                onChange={(event) => update('odometerStartKm', event.target.value)}
              />
            </FormField>
            <FormField
              label="도착 후 계기판(km)"
              htmlFor="edit-odometer-end"
              errors={state.fieldErrors.odometerEndKm}
            >
              <input
                id="edit-odometer-end"
                type="number"
                min={0}
                inputMode="numeric"
                className={inputClassName(Boolean(state.fieldErrors.odometerEndKm))}
                value={form.odometerEndKm}
                onChange={(event) => update('odometerEndKm', event.target.value)}
              />
            </FormField>
          </div>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="운행 요청 시간" desc={readOnly.visitRangeText} />
          <Row term="배정 차량" desc={readOnly.assignedVehicleText} />
          <Row term="실제 입차" desc={readOnly.actualEntryText} />
          <Row term="실제 출차" desc={readOnly.actualExitText} />
          <Row term="주행거리" desc={mileageText} />
          {readOnly.rejectionReason && <Row term="반려 사유" desc={readOnly.rejectionReason} />}
          {readOnly.cancelReason && <Row term="취소 사유" desc={readOnly.cancelReason} />}
        </dl>
      )}
    </CardShell>
  );
}
