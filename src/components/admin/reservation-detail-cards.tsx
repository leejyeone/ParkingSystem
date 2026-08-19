'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 관리자 예약 상세의 인라인 수정 카드.
 *
 * 신청자는 승인 대기 + 마감 시각 이전에만 스스로 수정할 수 있어, 그 외의 변경 요청은
 * 담당자 문의로 안내된다. 두 카드의 [수정하기] 버튼이 그 문의를 처리하는 창구다.
 *
 * PUT /api/admin/reservations/[id] 는 예약 내용 전체를 받으므로,
 * 어느 카드에서 저장하든 현재 값 전체(EditableFields)를 함께 보낸다.
 */

export type EditableFields = {
  companyOrBranchName: string;
  requesterName: string;
  vehicleNo: string;
  visitPurpose: string;
  requestMemo: string;
  /** 'yyyy-MM-ddTHH:mm' (Asia/Seoul 기준, 서버에서 변환해 전달) */
  visitStartAt: string;
  visitEndAt: string;
};

type SaveState = {
  pending: boolean;
  fieldErrors: Record<string, string[]>;
  error: string | null;
};

const IDLE: SaveState = { pending: false, fieldErrors: {}, error: null };

function useReservationEdit(reservationId: number, initial: EditableFields) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(initial);
  const [state, setState] = useState<SaveState>(IDLE);

  function update(key: keyof EditableFields, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function cancel() {
    setForm(initial);
    setState(IDLE);
    setEditing(false);
  }

  async function save() {
    setState({ pending: true, fieldErrors: {}, error: null });

    const response = await apiRequest(`/api/admin/reservations/${reservationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...form,
        visitPurpose: form.visitPurpose || null,
        requestMemo: form.requestMemo || null,
      }),
    });

    if (response.ok) {
      setState(IDLE);
      setEditing(false);
      router.refresh();
      return;
    }

    setState({
      pending: false,
      fieldErrors: response.error.fieldErrors ?? {},
      error: response.error.message,
    });
  }

  return { editing, setEditing, form, update, state, save, cancel };
}

function CardShell({
  title,
  editable,
  editing,
  pending,
  error,
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

/** 신청 정보 카드 — 상호/성명/차량번호/방문 목적/요청 메모를 수정한다. */
export function RequesterInfoCard({
  reservationId,
  editable,
  initial,
  readOnly,
}: {
  reservationId: number;
  editable: boolean;
  initial: EditableFields;
  readOnly: {
    requesterTypeLabel: string;
    requesterEmail: string;
    privacyConsentText: string;
    createdAtText: string;
  };
}) {
  const { editing, setEditing, form, update, state, save, cancel } = useReservationEdit(
    reservationId,
    initial,
  );

  return (
    <CardShell
      title="신청 정보"
      editable={editable}
      editing={editing}
      pending={state.pending}
      error={state.error}
      onEdit={() => setEditing(true)}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="방문 상호/지사"
              htmlFor="edit-company"
              required
              errors={state.fieldErrors.companyOrBranchName}
            >
              <input
                id="edit-company"
                className={inputClassName(Boolean(state.fieldErrors.companyOrBranchName))}
                value={form.companyOrBranchName}
                onChange={(event) => update('companyOrBranchName', event.target.value)}
                maxLength={100}
              />
            </FormField>
            <FormField
              label="성명"
              htmlFor="edit-name"
              required
              errors={state.fieldErrors.requesterName}
            >
              <input
                id="edit-name"
                className={inputClassName(Boolean(state.fieldErrors.requesterName))}
                value={form.requesterName}
                onChange={(event) => update('requesterName', event.target.value)}
                maxLength={50}
              />
            </FormField>
            <FormField
              label="차량번호"
              htmlFor="edit-vehicle"
              required
              errors={state.fieldErrors.vehicleNo}
            >
              <input
                id="edit-vehicle"
                className={inputClassName(Boolean(state.fieldErrors.vehicleNo))}
                value={form.vehicleNo}
                onChange={(event) => update('vehicleNo', event.target.value)}
                maxLength={20}
              />
            </FormField>
            <FormField
              label="방문 목적"
              htmlFor="edit-purpose"
              errors={state.fieldErrors.visitPurpose}
            >
              <input
                id="edit-purpose"
                className={inputClassName(Boolean(state.fieldErrors.visitPurpose))}
                value={form.visitPurpose}
                onChange={(event) => update('visitPurpose', event.target.value)}
                maxLength={200}
              />
            </FormField>
          </div>

          <FormField label="요청 메모" htmlFor="edit-memo" errors={state.fieldErrors.requestMemo}>
            <textarea
              id="edit-memo"
              rows={2}
              className={inputClassName(Boolean(state.fieldErrors.requestMemo))}
              value={form.requestMemo}
              onChange={(event) => update('requestMemo', event.target.value)}
              maxLength={1000}
            />
          </FormField>

          <p className="field-hint">
            이메일은 본인 확인 기준이자 안내 메일 발송지라 변경할 수 없습니다. 저장하면 신청자에게
            변경 안내 메일이 발송되고 감사 로그에 기록됩니다.
          </p>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="신청 구분" desc={readOnly.requesterTypeLabel} />
          <Row term="방문 상호/지사" desc={initial.companyOrBranchName} />
          <Row term="성명" desc={initial.requesterName} />
          <Row term="이메일" desc={readOnly.requesterEmail} />
          <Row term="차량번호" desc={initial.vehicleNo} />
          <Row term="방문 목적" desc={initial.visitPurpose || '-'} />
          <Row term="요청 메모" desc={initial.requestMemo || '-'} />
          <Row term="개인정보 동의" desc={readOnly.privacyConsentText} />
          <Row term="신청 일시" desc={readOnly.createdAtText} />
        </dl>
      )}
    </CardShell>
  );
}

/** 일정 및 주차 위치 카드 — 방문 예정 시간을 수정한다. */
export function ScheduleCard({
  reservationId,
  editable,
  initial,
  readOnly,
}: {
  reservationId: number;
  editable: boolean;
  initial: EditableFields;
  readOnly: {
    title: string;
    visitRangeText: string;
    actualEntryText: string;
    actualExitText: string;
    /** 주차면 배정을 사용할 때만 전달한다. */
    spaceSection: ReactNode;
    rejectionReason: string | null;
    cancelReason: string | null;
  };
}) {
  const { editing, setEditing, form, update, state, save, cancel } = useReservationEdit(
    reservationId,
    initial,
  );

  return (
    <CardShell
      title={readOnly.title}
      editable={editable}
      editing={editing}
      pending={state.pending}
      error={state.error}
      onEdit={() => setEditing(true)}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="입차 예정"
              htmlFor="edit-start"
              required
              errors={state.fieldErrors.visitStartAt}
            >
              <input
                id="edit-start"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.visitStartAt))}
                value={form.visitStartAt}
                onChange={(event) => update('visitStartAt', event.target.value)}
              />
            </FormField>
            <FormField
              label="출차 예정"
              htmlFor="edit-end"
              required
              errors={state.fieldErrors.visitEndAt}
            >
              <input
                id="edit-end"
                type="datetime-local"
                className={inputClassName(Boolean(state.fieldErrors.visitEndAt))}
                value={form.visitEndAt}
                onChange={(event) => update('visitEndAt', event.target.value)}
              />
            </FormField>
          </div>

          <p className="field-hint">
            운영시간과 최대 이용시간은 그대로 적용됩니다. 이미 주차면이 배정된 예약이면 바뀐
            시간대에 충돌이 없는지 다시 확인합니다. 예약 상태는 유지됩니다.
          </p>
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="방문 예정" desc={readOnly.visitRangeText} />
          <Row term="실제 입차" desc={readOnly.actualEntryText} />
          <Row term="실제 출차" desc={readOnly.actualExitText} />
          {readOnly.spaceSection}
          {readOnly.rejectionReason && <Row term="반려 사유" desc={readOnly.rejectionReason} />}
          {readOnly.cancelReason && <Row term="취소 사유" desc={readOnly.cancelReason} />}
        </dl>
      )}
    </CardShell>
  );
}
