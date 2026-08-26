'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  reservationId: number;
  reservationNo: string;
  reservationStatus: string;
  visitRangeText: string;
  emailNoticeSentTo: string;
};

/**
 * visitor: 방문객 본인 신청 (공개, 로그인 선택)
 * employee-self: 직원 본인 방문 신청 (로그인 필수, 동의 카드 없음)
 * employee-proxy: 직원이 담당 방문객을 대신 신청 (로그인 필수, "동의 확인" 체크로 대체)
 */
export type ReservationFormMode = 'visitor' | 'employee-self' | 'employee-proxy';

const ENDPOINT_BY_MODE: Record<ReservationFormMode, string> = {
  visitor: '/api/reservations',
  'employee-self': '/api/reservations/employee',
  'employee-proxy': '/api/reservations/employee/proxy',
};

type FormState = {
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
  mode,
  settings,
  initialValues,
  autofilled = false,
}: {
  mode: ReservationFormMode;
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

    const basePayload = {
      companyOrBranchName: form.companyOrBranchName,
      requesterName: form.requesterName,
      requesterEmail: form.requesterEmail,
      vehicleNo: form.vehicleNo,
      visitPurpose: form.visitPurpose || null,
      requestMemo: form.requestMemo || null,
      visitStartAt: form.visitStartAt,
      visitEndAt: form.visitEndAt,
    };
    const payload =
      mode === 'visitor'
        ? { ...basePayload, privacyConsent: form.privacyConsent }
        : mode === 'employee-proxy'
          ? { ...basePayload, visitorConsentConfirmed: form.privacyConsent }
          : basePayload;

    const response = await apiRequest<CreateResponse>(ENDPOINT_BY_MODE[mode], {
      method: 'POST',
      body: JSON.stringify(payload),
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
    return (
      <CompletionView
        mode={mode}
        result={result}
        requesterName={form.requesterName}
        vehicleNo={form.vehicleNo}
      />
    );
  }

  // 방문 목적/요청 메모는 선택 입력이라 뺀다. 서버가 최종 검증하며, 이건 버튼 활성화용 힌트일 뿐이다.
  const isFormValid =
    form.companyOrBranchName.trim() !== '' &&
    form.requesterName.trim() !== '' &&
    form.requesterEmail.trim() !== '' &&
    form.vehicleNo.trim() !== '' &&
    form.visitStartAt !== '' &&
    form.visitEndAt !== '' &&
    // 직원 본인 신청은 개인정보 수집·이용 동의 카드를 보여주지 않으므로 체크 여부를 요구하지 않는다.
    (mode === 'employee-self' || form.privacyConsent);

  // 서버 검증 오류 필드명이 모드별로 다르다(privacyConsent vs visitorConsentConfirmed).
  const consentFieldErrors =
    mode === 'employee-proxy' ? fieldErrors.visitorConsentConfirmed : fieldErrors.privacyConsent;

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
            label={mode === 'employee-self' ? '소속 사업장명' : '방문상호'}
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

      {mode !== 'employee-self' && (
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
                consentFieldErrors ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
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
                {mode === 'employee-proxy'
                  ? '방문객에게 위 수집·이용 목적을 안내하였고, 방문객으로부터 개인정보 수집·이용 동의를 확인하였습니다.'
                  : '위 내용을 확인하였으며 개인정보 수집 및 이용에 동의합니다.'}
              </span>
            </label>
            {consentFieldErrors && (
              <p className="field-error" role="alert">
                {consentFieldErrors[0]}
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

function CompletionView({
  mode,
  result,
  requesterName,
  vehicleNo,
}: {
  mode: ReservationFormMode;
  result: CreateResponse;
  /** 방금 제출한 신청자 성명/차량번호. 방문객 조회 화면으로 자동 진입하는 데 쓴다. */
  requesterName: string;
  vehicleNo: string;
}) {
  const router = useRouter();
  const isEmployee = mode !== 'visitor';
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /**
   * 방문객은 이 예약을 성명·차량번호로 다시 검증해 접근 토큰을 발급받아 곧바로
   * 조회 화면으로 이동한다. 방금 신청한 값을 그대로 쓰므로 다시 입력할 필요가 없다.
   */
  async function handleLookupNow() {
    if (lookingUp) return;
    setLookingUp(true);
    setLookupError(null);

    const response = await apiRequest<{ accessPath: string }>('/api/reservations/lookup/access', {
      method: 'POST',
      body: JSON.stringify({
        reservationId: result.reservationId,
        requesterName,
        vehicleNo,
      }),
    });

    if (response.ok) {
      router.push(response.data.accessPath);
      return;
    }

    setLookingUp(false);
    setLookupError(response.error.message);
  }

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
          {lookupError && <Alert variant="error">{lookupError}</Alert>}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {isEmployee ? (
            <Link href="/employee/reservations" className="btn btn-primary">
              내 신청 내역
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleLookupNow}
              disabled={lookingUp}
            >
              {lookingUp ? '조회 중…' : '방금 신청한 예약 조회하기'}
            </button>
          )}
          <Link href={isEmployee ? '/employee' : '/'} className="btn btn-secondary">
            {isEmployee ? '직원 홈으로' : '처음으로'}
          </Link>
        </div>
      </div>
    </div>
  );
}
