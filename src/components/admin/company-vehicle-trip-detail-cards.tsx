'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { EmployeeSearchSelect } from '@/components/reservation/employee-search-select';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 법인차량 신청 상세의 인라인 수정 카드. `reservation-detail-cards.tsx`(방문 예약 상세)와
 * 같은 패턴 — 카드 우상단 [수정하기]를 누르면 그 카드만 편집 모드로 바뀐다.
 *
 * 신청 직원/행선지/사유/운행시간/배정 차량/실제 출입차 시각은 PATCH
 * /api/admin/company-vehicle-trips/[id] 로, 주행거리는 POST
 * /api/admin/company-vehicle-trips/[id]/mileage 로 따로 저장하지만, 세 카드(신청
 * 정보·운행 일정·주행 기록) 중 어느 쪽에서 저장하든 현재 폼 전체를 두 요청에 함께
 * 실어 보낸다(방문 예약이 "PUT 은 전체를 받으니 어느 카드에서 저장하든
 * EditableFields 전체를 보낸다"는 것과 같은 이유).
 */

export type EditableFields = {
  employeeUserId: number;
  /** EmployeeSearchSelect 초기 표시용. 서버로는 안 보낸다. */
  employeeLabel: string;
  destination: string;
  reason: string;
  /** 'yyyy-MM-ddTHH:mm' (Asia/Seoul 기준) */
  requestStartAt: string;
  requestEndAt: string;
  assignedVehicleId: number | null;
  /** 'yyyy-MM-ddTHH:mm' (Asia/Seoul 기준). 아직 기록 전이면 빈 문자열. */
  actualEntryAt: string;
  actualExitAt: string;
  /** 입력 필드 바인딩용 문자열. 빈 문자열이면 미기록. */
  odometerStartKm: string;
  odometerEndKm: string;
  /** 계기판을 확인할 수 없을 때 대신 적는 주행거리(km). 빈 문자열이면 미기록. */
  manualDistanceKm: string;
};

export type VehicleOption = { vehicleId: number; vehicleNo: string; isActive: boolean };

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

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
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
          employeeUserId: form.employeeUserId,
          destination: form.destination,
          reason: form.reason,
          requestStartAt: form.requestStartAt,
          requestEndAt: form.requestEndAt,
          assignedVehicleId: form.assignedVehicleId,
          actualEntryAt: form.actualEntryAt,
          actualExitAt: form.actualExitAt,
        }),
      }),
      apiRequest(`/api/admin/company-vehicle-trips/${tripId}/mileage`, {
        method: 'POST',
        body: JSON.stringify({
          odometerStartKm: form.odometerStartKm,
          odometerEndKm: form.odometerEndKm,
          manualDistanceKm: form.manualDistanceKm,
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
            label="신청 직원"
            htmlFor="edit-employee"
            required
            hint="이름 또는 부서명으로 검색해 다른 직원으로 바꿀 수 있습니다."
            errors={state.fieldErrors.employeeUserId}
          >
            <EmployeeSearchSelect
              id="edit-employee"
              value={{ employeeUserId: form.employeeUserId, label: form.employeeLabel }}
              hasError={Boolean(state.fieldErrors.employeeUserId)}
              onChange={(selected) => {
                if (!selected) return;
                update('employeeUserId', selected.employeeUserId);
                update('employeeLabel', selected.label);
              }}
            />
          </FormField>
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

/** 운행 일정 카드 — 운행 요청 시간·배정 차량·실제 출입차 시각을 수정한다. */
export function CompanyVehicleTripScheduleCard({
  tripId,
  editable,
  initial,
  vehicles,
  readOnly,
}: {
  tripId: number;
  editable: boolean;
  initial: EditableFields;
  vehicles: VehicleOption[];
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

  // 이미 배정된 차량이 비활성화돼 목록에서 빠졌더라도, 편집 시 선택값이 사라지지
  // 않도록 목록에 끼워 넣는다.
  const vehicleOptions =
    initial.assignedVehicleId !== null &&
    !vehicles.some((vehicle) => vehicle.vehicleId === initial.assignedVehicleId)
      ? [
          ...vehicles,
          { vehicleId: initial.assignedVehicleId, vehicleNo: readOnly.assignedVehicleText, isActive: false },
        ]
      : vehicles;

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

          {/* 법인차량은 방문 예약과 입출차 방향이 반대라, actualEntryAt이 "실제 출차",
              actualExitAt이 "실제 입차"다. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="실제 출차 시각"
              htmlFor="edit-actual-entry"
              hint="아직 출차 처리 전이면 비워 둡니다."
              errors={state.fieldErrors.actualEntryAt}
            >
              <input
                id="edit-actual-entry"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.actualEntryAt))}
                value={form.actualEntryAt}
                onChange={(event) => update('actualEntryAt', event.target.value)}
              />
            </FormField>
            <FormField
              label="실제 입차 시각"
              htmlFor="edit-actual-exit"
              hint="아직 입차 처리 전이면 비워 둡니다."
              errors={state.fieldErrors.actualExitAt}
            >
              <input
                id="edit-actual-exit"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.actualExitAt))}
                value={form.actualExitAt}
                onChange={(event) => update('actualExitAt', event.target.value)}
              />
            </FormField>
          </div>

          <FormField
            label="배정 차량"
            htmlFor="edit-vehicle"
            errors={state.fieldErrors.assignedVehicleId}
          >
            <select
              id="edit-vehicle"
              className={inputClassName(Boolean(state.fieldErrors.assignedVehicleId))}
              value={form.assignedVehicleId ?? ''}
              onChange={(event) =>
                update('assignedVehicleId', event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">미지정</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                  {vehicle.vehicleNo}
                  {!vehicle.isActive ? ' (비활성)' : ''}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="운행 요청 시간" desc={readOnly.visitRangeText} />
          {/* 법인차량은 방문 예약과 입출차 방향이 반대라, actualEntryAt(APPROVED→PARKING
              시각)이 "실제 출차", actualExitAt(PARKING→EXITED 시각)이 "실제 입차"다. */}
          <Row term="실제 출차" desc={readOnly.actualEntryText} />
          <Row term="실제 입차" desc={readOnly.actualExitText} />
          <Row term="배정 차량" desc={readOnly.assignedVehicleText} />
          {readOnly.rejectionReason && <Row term="반려 사유" desc={readOnly.rejectionReason} />}
          {readOnly.cancelReason && <Row term="취소 사유" desc={readOnly.cancelReason} />}
        </dl>
      )}
    </CardShell>
  );
}

/** 계기판 두 값이 있으면 그 차이를, 없으면 직접 입력한 주행거리를 우선순위대로 고른다. */
function resolveMileageText(fields: Pick<EditableFields, 'odometerStartKm' | 'odometerEndKm' | 'manualDistanceKm'>): string {
  if (fields.odometerStartKm !== '' && fields.odometerEndKm !== '') {
    return `${Number(fields.odometerEndKm) - Number(fields.odometerStartKm)}km`;
  }
  if (fields.manualDistanceKm !== '') {
    return `${fields.manualDistanceKm}km`;
  }
  return '-';
}

/** 주행 기록 카드 — 출발/도착 계기판 값(또는 계기판 없이 주행거리만)을 수정한다. */
export function CompanyVehicleTripMileageCard({
  tripId,
  editable,
  initial,
  autoOpen,
}: {
  tripId: number;
  editable: boolean;
  initial: EditableFields;
  /** 출차/입차 처리 직후 이 카드를 자동으로 편집 모드로 열어 입력을 유도한다. */
  autoOpen?: boolean;
}) {
  const { editing, setEditing, form, update, state, saved, save, cancel } = useTripEdit(
    tripId,
    initial,
  );

  const hasAnyMileageRecord =
    initial.odometerStartKm !== '' || initial.odometerEndKm !== '' || initial.manualDistanceKm !== '';

  useEffect(() => {
    // 이미 뭔가 기록돼 있으면(계기판이든 직접 입력이든) 자동으로 편집 모드를 열지 않는다 —
    // 입력을 유도할 필요가 없는 상태라 실수로 기존 값을 건드리게 하지 않기 위함이다.
    if (autoOpen && editable && !hasAnyMileageRecord) {
      setEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mileageText = resolveMileageText(initial);

  return (
    <CardShell
      title="주행 기록"
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
          <FormField
            label="주행거리 직접 입력(km)"
            htmlFor="edit-manual-distance"
            hint="계기판을 확인할 수 없으면 이 칸에 주행거리만 입력해도 됩니다."
            errors={state.fieldErrors.manualDistanceKm}
          >
            <input
              id="edit-manual-distance"
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClassName(Boolean(state.fieldErrors.manualDistanceKm))}
              value={form.manualDistanceKm}
              onChange={(event) => update('manualDistanceKm', event.target.value)}
            />
          </FormField>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="출발 전 계기판" desc={initial.odometerStartKm !== '' ? `${initial.odometerStartKm}km` : '-'} />
          <Row term="도착 후 계기판" desc={initial.odometerEndKm !== '' ? `${initial.odometerEndKm}km` : '-'} />
          <Row term="주행거리" desc={mileageText} />
        </dl>
      )}
    </CardShell>
  );
}
