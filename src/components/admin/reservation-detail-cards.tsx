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
 * PUT /api/admin/reservations/[id] 는 부분 수정을 받는다 — 각 카드는 자기 영역의
 * 필드만 보내고, 안 보낸 필드는 서버가 지금 DB 값을 그대로 유지한다
 * (updateReservationByAdmin 참고). 예전에는 항상 EditableFields 전체를 같이 보내야
 * 해서, 한 카드가 저장한 값을 다른 카드가 모른 채 자기가 처음 열렸을 때의 옛 값으로
 * 덮어써 버리는 문제가 있었다 — 카드마다 자기 필드만 보내면 그 문제 자체가 생기지 않는다.
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
  /** 운영시간/최대 이용시간을 벗어난 시간대를 예외로 허용하는 사유. 비어 있으면 예외 없음. */
  timingExceptionReason: string;
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
  /** 방금 저장에 성공했는지. [수정하기]를 다시 누르면 지운다. */
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

    // 이 카드가 보여주고 고치는 필드만 보낸다(방문 일정은 다른 카드 소관이라 안 보낸다).
    const response = await apiRequest(`/api/admin/reservations/${reservationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        companyOrBranchName: form.companyOrBranchName,
        requesterName: form.requesterName,
        vehicleNo: form.vehicleNo,
        visitPurpose: form.visitPurpose || null,
        requestMemo: form.requestMemo || null,
      }),
    });

    if (response.ok) {
      setState(IDLE);
      setEditing(false);
      setSaved(true);
      router.refresh();
      return;
    }

    setState({
      pending: false,
      fieldErrors: response.error.fieldErrors ?? {},
      error: response.error.message,
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
  /** 방금 저장에 성공했는지. 성공 안내를 잠깐 보여주는 데만 쓴다. */
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
    requesterType: 'VISITOR' | 'EMPLOYEE';
    requesterTypeLabel: string;
    requesterEmail: string;
    privacyConsentText: string;
    /** 직원 본인 방문(EMPLOYEE)은 서약 대상이 아니라 null. */
    securityPledgeConsentText: string | null;
    createdAtText: string;
    /** 직원이 대신 신청한 건이면 당사 담당 직원 이름/이메일. 그 외에는 null. */
    employeeUserText: string | null;
  };
}) {
  const { editing, setEditing, form, update, state, saved, save, cancel } = useReservationEdit(
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
      saved={saved}
      onEdit={setEditing}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={readOnly.requesterType === 'EMPLOYEE' ? '사업장' : '회사명'}
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
              required
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
          {readOnly.employeeUserText && <Row term="당사 담당자" desc={readOnly.employeeUserText} />}
          <Row
            term={readOnly.requesterType === 'EMPLOYEE' ? '사업장' : '회사명'}
            desc={initial.companyOrBranchName}
          />
          <Row term="성명" desc={initial.requesterName} />
          <Row term="이메일" desc={readOnly.requesterEmail} />
          <Row term="차량번호" desc={initial.vehicleNo} />
          <Row term="방문 목적" desc={initial.visitPurpose || '-'} />
          <Row term="요청 메모" desc={initial.requestMemo || '-'} />
          <Row term="개인정보 동의" desc={readOnly.privacyConsentText} />
          {readOnly.securityPledgeConsentText && (
            <Row term="보안서약서 동의" desc={readOnly.securityPledgeConsentText} />
          )}
          <Row term="신청 일시" desc={readOnly.createdAtText} />
        </dl>
      )}
    </CardShell>
  );
}

/** 일정 및 주차 위치 카드 — 방문 예정 시간과, 실제 입·출차 기록을 수정한다. */
export function ScheduleCard({
  reservationId,
  editable,
  initial,
  /** 시스템 설정의 입·출차 관리 사용 여부. false 면 "실제 입차/출차" 행을 감춘다. */
  entryExitManagementEnabled,
  /** 기록된 실제 입차 시각('yyyy-MM-ddTHH:mm', KST). 아직 입차 처리 전이면 null. */
  actualEntryAt,
  /** 기록된 실제 출차 시각('yyyy-MM-ddTHH:mm', KST). 아직 출차 처리 전이면 null. */
  actualExitAt,
  readOnly,
}: {
  reservationId: number;
  editable: boolean;
  initial: EditableFields;
  entryExitManagementEnabled: boolean;
  actualEntryAt: string | null;
  actualExitAt: string | null;
  readOnly: {
    title: string;
    visitRangeText: string;
    actualEntryText: string;
    actualExitText: string;
    /** 주차면 배정을 사용할 때만 전달한다. */
    spaceSection: ReactNode;
    rejectionReason: string | null;
    cancelReason: string | null;
    /** 예외 신청 사유. 예외가 아니면 null. */
    timingExceptionReasonText: string | null;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableFields>(initial);
  // 일정 저장이 먼저 성공한 뒤 입출차 기록 저장이 실패할 수 있다(2단계 저장).
  // 그 경우에도 "취소"를 누르면 이미 서버에 반영된 일정으로 되돌아가야 하므로,
  // 서버에 반영된 것으로 확인된 마지막 값을 별도로 추적한다.
  const [committed, setCommitted] = useState<EditableFields>(initial);
  // null 은 "기록 삭제 예정"을 뜻한다. 실제 삭제는 저장을 눌러야 반영된다.
  const [entryDraft, setEntryDraft] = useState<string | null>(actualEntryAt);
  const [exitDraft, setExitDraft] = useState<string | null>(actualExitAt);
  const [state, setState] = useState<SaveState>(IDLE);
  const [saved, setSaved] = useState(false);
  const [timingExceptionOpen, setTimingExceptionOpen] = useState(
    Boolean(initial.timingExceptionReason),
  );

  // 출차 기록이 남아 있으면 입차 기록을 먼저 지울 수 없다 — 서버 쪽 규칙과 맞춘다.
  // 출차 기록을 먼저 지우고 저장한 뒤, 다시 열면 입차 기록도 지울 수 있다.
  const canEditEntryRecord =
    entryExitManagementEnabled && actualEntryAt !== null && actualExitAt === null;
  const canEditExitRecord = entryExitManagementEnabled && actualExitAt !== null;

  function update(key: keyof EditableFields, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  function cancel() {
    setForm(committed);
    setEntryDraft(actualEntryAt);
    setExitDraft(actualExitAt);
    setTimingExceptionOpen(Boolean(committed.timingExceptionReason));
    setState(IDLE);
    setEditing(false);
  }

  async function save() {
    setState({ pending: true, fieldErrors: {}, error: null });

    if (editable) {
      // 이 카드가 보여주고 고치는 필드(방문 일정)만 보낸다 — 차량번호 등 "신청 정보"
      // 카드 소관인 필드는 안 보낸다.
      const response = await apiRequest(`/api/admin/reservations/${reservationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          visitStartAt: form.visitStartAt,
          visitEndAt: form.visitEndAt,
          timingExceptionReason: timingExceptionOpen ? form.timingExceptionReason : null,
        }),
      });

      if (!response.ok) {
        setState({
          pending: false,
          fieldErrors: response.error.fieldErrors ?? {},
          error: response.error.message,
        });
        return;
      }

      // 일정 저장은 이미 서버에 반영되었다 — 뒤이은 입출차 기록 저장이 실패하더라도
      // "취소"를 누르면 이 값으로 되돌아가야 한다(저장 전 값으로 되돌리면 안 됨).
      setCommitted({
        ...form,
        timingExceptionReason: timingExceptionOpen ? form.timingExceptionReason : '',
      });
      router.refresh();
    }

    const entryChanged = entryDraft !== actualEntryAt;
    const exitChanged = exitDraft !== actualExitAt;

    if (entryExitManagementEnabled && (entryChanged || exitChanged)) {
      const body: { actualEntryAt?: string | null; actualExitAt?: string | null } = {};
      // 서버가 출차 → 입차 순서로 처리하므로 순서는 상관없다.
      if (exitChanged) body.actualExitAt = exitDraft;
      if (entryChanged) body.actualEntryAt = entryDraft;

      const response = await apiRequest(
        `/api/admin/reservations/${reservationId}/entry-exit-record`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setState({
          pending: false,
          fieldErrors: response.error.fieldErrors ?? {},
          error: response.error.message,
        });
        return;
      }

      // 입·출차 기록 삭제는 단순 정보 수정이 아니라 예약 상태를 되돌리는 상태 변경(PARKING→
      // APPROVED, EXITED→PARKING)이다. ReservationActionPanel 의 다른 상태 변경 버튼들과
      // 마찬가지로 대시보드로 돌려보낸다.
      router.push('/admin');
      return;
    }

    setState(IDLE);
    setEditing(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <CardShell
      title={readOnly.title}
      editable={editable || canEditEntryRecord || canEditExitRecord}
      editing={editing}
      pending={state.pending}
      error={state.error}
      saved={saved}
      onEdit={startEditing}
      onCancel={cancel}
      onSave={save}
    >
      {editing ? (
        <div className="mt-3 space-y-3">
          {editable ? (
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
          ) : (
            <Row term="방문 예정" desc={readOnly.visitRangeText} />
          )}

          {editable && (
            <p className="field-hint">
              운영시간과 최대 이용시간은 그대로 적용됩니다. 이미 주차면이 배정된 예약이면 바뀐
              시간대에 충돌이 없는지 다시 확인합니다. 예약 상태는 유지됩니다.
            </p>
          )}

          {editable && (
            <div className="border-line-muted space-y-2 border-t pt-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="accent-brand-700 size-4"
                  checked={timingExceptionOpen}
                  onChange={(event) => setTimingExceptionOpen(event.target.checked)}
                />
                운영시간·최대 이용시간 제한 예외 허용
              </label>
              {timingExceptionOpen && (
                <FormField
                  label="예외 사유"
                  htmlFor="edit-timing-exception-reason"
                  required
                  hint="저장하면 관리자 본인 승인으로 바로 확정됩니다."
                  errors={state.fieldErrors.timingExceptionReason}
                >
                  <textarea
                    id="edit-timing-exception-reason"
                    rows={2}
                    className={inputClassName(Boolean(state.fieldErrors.timingExceptionReason))}
                    value={form.timingExceptionReason}
                    onChange={(event) => update('timingExceptionReason', event.target.value)}
                    maxLength={300}
                  />
                </FormField>
              )}
            </div>
          )}

          {(canEditEntryRecord || canEditExitRecord) && (
            <div className="border-line-muted space-y-3 border-t pt-3">
              {canEditEntryRecord &&
                (entryDraft !== null ? (
                  <FormField
                    label="실제 입차 시각"
                    htmlFor="edit-actual-entry"
                    errors={state.fieldErrors.actualEntryAt}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="edit-actual-entry"
                        type="datetime-local"
                        className={inputClassName(Boolean(state.fieldErrors.actualEntryAt))}
                        value={entryDraft}
                        onChange={(event) => setEntryDraft(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        onClick={() => setEntryDraft(null)}
                      >
                        입차 삭제
                      </button>
                    </div>
                  </FormField>
                ) : (
                  <FormField
                    label="실제 입차 시각"
                    htmlFor="edit-actual-entry"
                    errors={state.fieldErrors.actualEntryAt}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-faint text-sm">
                        저장하면 삭제되어 승인 완료 상태로 돌아갑니다. (차가 오지 않았다면 이후
                        미방문 처리)
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        onClick={() => setEntryDraft(actualEntryAt)}
                      >
                        삭제 취소
                      </button>
                    </div>
                  </FormField>
                ))}

              {canEditExitRecord &&
                (exitDraft !== null ? (
                  <FormField
                    label="실제 출차 시각"
                    htmlFor="edit-actual-exit"
                    errors={state.fieldErrors.actualExitAt}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="edit-actual-exit"
                        type="datetime-local"
                        className={inputClassName(Boolean(state.fieldErrors.actualExitAt))}
                        value={exitDraft}
                        onChange={(event) => setExitDraft(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        onClick={() => setExitDraft(null)}
                      >
                        출차 삭제
                      </button>
                    </div>
                  </FormField>
                ) : (
                  <FormField
                    label="실제 출차 시각"
                    htmlFor="edit-actual-exit"
                    errors={state.fieldErrors.actualExitAt}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-faint text-sm">
                        저장하면 삭제되어 입차 중 상태로 돌아갑니다.
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                        onClick={() => setExitDraft(actualExitAt)}
                      >
                        삭제 취소
                      </button>
                    </div>
                  </FormField>
                ))}
            </div>
          )}
        </div>
      ) : (
        <dl className="mt-3">
          <Row term="방문 예정" desc={readOnly.visitRangeText} />
          {/*
            입·출차 관리를 쓰지 않는 동안에는 실제 입/출차 기록이 절대 남지 않아
            이 두 행이 항상 "-" 로만 보인다. 마치 실제 출입을 추적하는 것처럼 오해할 수 있어
            시스템 설정에서 기능을 켰을 때만 보여준다.
          */}
          {entryExitManagementEnabled && (
            <>
              <Row term="실제 입차" desc={readOnly.actualEntryText} />
              <Row term="실제 출차" desc={readOnly.actualExitText} />
            </>
          )}
          {readOnly.spaceSection}
          {readOnly.rejectionReason && <Row term="반려 사유" desc={readOnly.rejectionReason} />}
          {readOnly.cancelReason && <Row term="취소 사유" desc={readOnly.cancelReason} />}
          {readOnly.timingExceptionReasonText && (
            <Row term="시간 예외" desc={readOnly.timingExceptionReasonText} />
          )}
        </dl>
      )}
    </CardShell>
  );
}
