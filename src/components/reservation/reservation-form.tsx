'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Settings = {
  reservationMinLeadMinutes: number;
  parkingOpenTime: string;
  parkingCloseTime: string;
  maxReservationHours: number;
  /** 주차면 배정 사용 여부. false 면 위치 안내 문구를 바꾼다. */
  spaceAssignmentEnabled: boolean;
  /**
   * 입력 가능한 가장 이른 시각('yyyy-MM-ddTHH:mm').
   * 기기 타임존과 무관하게 Asia/Seoul 기준으로 맞추기 위해 서버에서 계산해 전달한다.
   * 입력 편의용 힌트이며 실제 판정은 서버가 다시 수행한다.
   */
  minDateTimeInput: string;
};

/** 로그인 회원이면 서버가 프로필로 채워 보내는 초기값 */
export type ReservationFormInitialValues = {
  companyOrBranchName?: string;
  requesterName?: string;
  requesterEmail?: string;
  vehicleNo?: string;
};

type CreateResponse = {
  reservationNo: string;
  reservationStatus: string;
  visitRangeText: string;
  emailNoticeSentTo: string;
};

type FormState = {
  requesterType: 'VISITOR' | 'EMPLOYEE';
  companyOrBranchName: string;
  requesterName: string;
  requesterEmail: string;
  vehicleNo: string;
  visitPurpose: string;
  requestMemo: string;
  visitStartAt: string;
  visitEndAt: string;
  privacyConsent: boolean;
};

function buildInitialState(initialValues?: ReservationFormInitialValues): FormState {
  return {
    requesterType: 'VISITOR',
    companyOrBranchName: initialValues?.companyOrBranchName ?? '',
    requesterName: initialValues?.requesterName ?? '',
    requesterEmail: initialValues?.requesterEmail ?? '',
    vehicleNo: initialValues?.vehicleNo ?? '',
    visitPurpose: '',
    requestMemo: '',
    visitStartAt: '',
    visitEndAt: '',
    privacyConsent: false,
  };
}

export function ReservationForm({
  settings,
  initialValues,
  autofilled = false,
}: {
  settings: Settings;
  initialValues?: ReservationFormInitialValues;
  /** 로그인 회원 정보로 자동완성된 상태인지 */
  autofilled?: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialValues));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResponse | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key as string];
      return next;
    });
  }

  /** 차량번호는 입력 중 공백과 하이픈을 자동으로 정리한다. */
  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    update('vehicleNo', normalizeVehicleNo(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest<CreateResponse>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        requesterType: form.requesterType,
        companyOrBranchName: form.companyOrBranchName,
        requesterName: form.requesterName,
        requesterEmail: form.requesterEmail,
        vehicleNo: form.vehicleNo,
        visitPurpose: form.visitPurpose || null,
        requestMemo: form.requestMemo || null,
        visitStartAt: form.visitStartAt,
        visitEndAt: form.visitEndAt,
        // 직원은 동의 카드를 보여주지 않는 대신, 서버 스키마가 요구하는 동의값을 자동으로 채운다.
        privacyConsent: form.requesterType === 'EMPLOYEE' ? true : form.privacyConsent,
      }),
    });

    setSubmitting(false);

    if (response.ok) {
      setResult(response.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (result) {
    return <CompletionView result={result} />;
  }

  // 방문 목적/요청 메모는 선택 입력이라 뺀다. 서버가 최종 검증하며, 이건 버튼 활성화용 힌트일 뿐이다.
  const isFormValid =
    form.companyOrBranchName.trim() !== '' &&
    form.requesterName.trim() !== '' &&
    form.requesterEmail.trim() !== '' &&
    form.vehicleNo.trim() !== '' &&
    form.visitStartAt !== '' &&
    form.visitEndAt !== '' &&
    // 직원은 개인정보 수집·이용 동의 카드를 보여주지 않으므로 체크 여부를 요구하지 않는다.
    (form.requesterType === 'EMPLOYEE' || form.privacyConsent);

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="mb-4">
          <Alert variant="error" title="신청을 완료하지 못했습니다">
            {formError.message}
          </Alert>
        </div>
      )}

      {autofilled && (
        <div className="mb-4">
          <Alert variant="success" title="회원 정보로 자동 입력했습니다">
            내용이 다르면 아래에서 바로 수정할 수 있습니다. 수정해도 회원 정보는 바뀌지 않습니다.
          </Alert>
        </div>
      )}

      <div className="card">
        <div className="card-body space-y-5">
          <FormField
            label="신청 구분"
            htmlFor="requesterType"
            required
            errors={fieldErrors.requesterType}
          >
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="신청 구분">
              {(
                [
                  { value: 'VISITOR', label: '방문객', desc: '외부 방문' },
                  { value: 'EMPLOYEE', label: '직원', desc: '타 사업장 근무' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.requesterType === option.value}
                  onClick={() => update('requesterType', option.value)}
                  className={`min-h-16 rounded-lg border-2 px-3 py-2 text-left transition ${
                    form.requesterType === option.value
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                  <span className="block text-xs text-slate-500">{option.desc}</span>
                </button>
              ))}
            </div>
            <input type="hidden" id="requesterType" value={form.requesterType} readOnly />
          </FormField>

          <FormField
            label={form.requesterType === 'VISITOR' ? '방문상호' : '소속 사업장명'}
            htmlFor="companyOrBranchName"
            required
            errors={fieldErrors.companyOrBranchName}
          >
            <input
              id="companyOrBranchName"
              name="companyOrBranchName"
              className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
              value={form.companyOrBranchName}
              onChange={(event) => update('companyOrBranchName', event.target.value)}
              maxLength={100}
              autoComplete="organization"
            />
          </FormField>

          <FormField
            label="성명"
            htmlFor="requesterName"
            required
            errors={fieldErrors.requesterName}
          >
            <input
              id="requesterName"
              name="requesterName"
              className={inputClassName(Boolean(fieldErrors.requesterName))}
              value={form.requesterName}
              onChange={(event) => update('requesterName', event.target.value)}
              maxLength={50}
              autoComplete="name"
            />
          </FormField>

          <FormField
            label="이메일"
            htmlFor="requesterEmail"
            required
            hint="신청 결과와 예약 조회 링크를 보내드립니다."
            errors={fieldErrors.requesterEmail}
          >
            <input
              id="requesterEmail"
              name="requesterEmail"
              type="email"
              inputMode="email"
              className={inputClassName(Boolean(fieldErrors.requesterEmail))}
              value={form.requesterEmail}
              onChange={(event) => update('requesterEmail', event.target.value)}
              placeholder="hong@example.com"
              maxLength={255}
              autoComplete="email"
            />
          </FormField>

          <FormField label="차량번호" htmlFor="vehicleNo" required errors={fieldErrors.vehicleNo}>
            <input
              id="vehicleNo"
              name="vehicleNo"
              className={inputClassName(Boolean(fieldErrors.vehicleNo))}
              value={form.vehicleNo}
              onChange={handleVehicleNoChange}
              placeholder="12가3456"
              maxLength={20}
            />
          </FormField>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-body space-y-5">
          <h2 className="card-title">방문 일정</h2>

          <FormField
            label="입차 예정 시간"
            htmlFor="visitStartAt"
            required
            hint={`방문 ${settings.reservationMinLeadMinutes}분 전까지만 신청 가능합니다. 운영시간(${settings.parkingOpenTime}~${settings.parkingCloseTime}) 내로 선택해 주세요.`}
            errors={fieldErrors.visitStartAt}
          >
            <input
              id="visitStartAt"
              name="visitStartAt"
              type="datetime-local"
              min={settings.minDateTimeInput}
              className={inputClassName(Boolean(fieldErrors.visitStartAt))}
              value={form.visitStartAt}
              onChange={(event) => update('visitStartAt', event.target.value)}
            />
          </FormField>

          <FormField
            label="출차 예정 시간"
            htmlFor="visitEndAt"
            required
            hint={`같은 날짜 내에서 최대 ${settings.maxReservationHours}시간까지 신청할 수 있습니다.`}
            errors={fieldErrors.visitEndAt}
          >
            <input
              id="visitEndAt"
              name="visitEndAt"
              type="datetime-local"
              min={form.visitStartAt || settings.minDateTimeInput}
              className={inputClassName(Boolean(fieldErrors.visitEndAt))}
              value={form.visitEndAt}
              onChange={(event) => update('visitEndAt', event.target.value)}
            />
          </FormField>

          <FormField label="방문 목적" htmlFor="visitPurpose" errors={fieldErrors.visitPurpose}>
            <input
              id="visitPurpose"
              name="visitPurpose"
              className={inputClassName(Boolean(fieldErrors.visitPurpose))}
              value={form.visitPurpose}
              onChange={(event) => update('visitPurpose', event.target.value)}
              placeholder="선택 입력 (예: 품질회의 참석)"
              maxLength={200}
            />
          </FormField>

          <FormField label="요청 메모" htmlFor="requestMemo" errors={fieldErrors.requestMemo}>
            <textarea
              id="requestMemo"
              name="requestMemo"
              rows={3}
              className={inputClassName(Boolean(fieldErrors.requestMemo))}
              value={form.requestMemo}
              onChange={(event) => update('requestMemo', event.target.value)}
              placeholder="선택 입력"
              maxLength={1000}
            />
          </FormField>

          {/* <Alert variant="info" title="주차 위치 안내">
            {settings.spaceAssignmentEnabled
              ? '주차 위치는 관리자가 배정합니다. 신청자가 직접 선택할 수 없습니다.'
              : '주차 위치는 지정되지 않습니다. 관리자 승인 후 방문하시어 현장 안내에 따라 주차해 주세요.'}
          </Alert> */}
        </div>
      </div>

      {form.requesterType === 'VISITOR' && (
        <div className="card mt-4">
          <div className="card-body">
            <h2 className="card-title">개인정보 수집 및 이용 동의</h2>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              <p>
                <strong>수집 항목</strong> : 성명, 이메일, 차량번호, 소속(상호/사업장), 방문 목적
              </p>
              <p className="mt-2">
                <strong>수집 목적</strong> : 방문 차량 방문 예약 접수·승인, 주차면 배정, 방문 관련
                안내 메일 발송
              </p>
              <p className="mt-2">
                <strong>보유 기간</strong> : 방문 종료 후 사내 방문 관리 규정에 따른 기간까지 보관
                후 파기
              </p>
              <p className="mt-2">
                동의를 거부할 권리가 있으며, 거부 시 방문 예약 신청이 제한됩니다.
              </p>
            </div>

            <label
              htmlFor="privacyConsent"
              className={`mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                fieldErrors.privacyConsent
                  ? 'border-red-400 bg-red-50'
                  : 'border-slate-300 bg-white'
              }`}
            >
              <input
                id="privacyConsent"
                name="privacyConsent"
                type="checkbox"
                className="accent-brand-700 size-5 shrink-0"
                checked={form.privacyConsent}
                onChange={(event) => update('privacyConsent', event.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-800">
                위 내용을 확인하였으며 개인정보 수집 및 이용에 동의합니다.
              </span>
            </label>
            {fieldErrors.privacyConsent && (
              <p className="field-error" role="alert">
                {fieldErrors.privacyConsent[0]}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="sticky-actions mt-4">
        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={submitting || !isFormValid}
        >
          {submitting ? '신청 중…' : '방문 신청하기'}
        </button>
      </div>
    </form>
  );
}

function CompletionView({ result }: { result: CreateResponse }) {
  return (
    <div className="card" data-testid="reservation-complete">
      <div className="card-body">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            ✓
          </div>
          <h2 className="mt-3 text-xl font-black text-slate-900">방문 신청이 접수되었습니다</h2>
          <p className="mt-1 text-sm text-slate-600">
            관리자 승인 후 결과를 이메일로 안내드립니다.
          </p>
        </div>

        <dl className="mt-5">
          <div className="definition-row">
            <dt className="definition-term">예약번호</dt>
            <dd className="definition-desc">
              <span className="font-mono font-bold" data-testid="reservation-no">
                {result.reservationNo}
              </span>
            </dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">방문 일정</dt>
            <dd className="definition-desc">{result.visitRangeText}</dd>
          </div>
          <div className="definition-row">
            <dt className="definition-term">예약 상태</dt>
            <dd className="definition-desc">
              <span className="badge bg-amber-100 text-amber-800">승인 대기</span>
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-3">
          <Alert variant="info" title="이메일이 발송되었습니다">
            <p>
              {result.emailNoticeSentTo} 주소로 접수 확인 메일을 보냈습니다. 메일의 링크나 성명·차량
              번호로 예약을 조회할 수 있습니다.
            </p>
            <p className="mt-1">메일이 도착하지 않으면 스팸함을 확인해 주세요.</p>
          </Alert>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href="/reservations/lookup" className="btn btn-primary">
            내 예약 조회하기
          </Link>
          <Link href="/" className="btn btn-secondary">
            처음으로
          </Link>
        </div>
      </div>
    </div>
  );
}
