'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import type { SelectedEmployee } from '@/components/reservation/employee-search-select';
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
  /** 개인정보 수집·이용 동의 카드의 "보유 기간" 문구에 노출할 보관 기간(일). */
  personalDataRetentionDays: number;
  /**
   * 입력 가능한 가장 이른 시각('yyyy-MM-ddTHH:mm').
   * 기기 타임존과 무관하게 Asia/Seoul 기준으로 맞추기 위해 서버에서 계산해 전달한다.
   * 입력 편의용 힌트이며 실제 판정은 서버가 다시 수행한다.
   */
  minDateTimeInput: string;
  /**
   * 입차 예정 시간 입력의 기본 선택값('yyyy-MM-ddTHH:mm'). 너무 이른 시각을 실수로
   * 선택하는 것을 줄이기 위해, 서버가 현재시각 기준으로 계산해 미리 채워 준다.
   */
  defaultDateTimeInput: string;
};

/**
 * visitor 모드는 회원 프로필 값을 그대로 읽기 전용으로 보여준다(수정은 마이페이지에서만).
 * employee-proxy 모드는 hostEmployee 가 항상 로그인한 직원 본인으로 고정된다(수정 불가).
 */
export type ReservationFormInitialValues = {
  companyOrBranchName?: string;
  requesterName?: string;
  requesterEmail?: string;
  vehicleNo?: string;
  hostEmployee?: SelectedEmployee;
};

type CreateResponse = {
  reservationId: number;
  reservationNo: string;
  reservationStatus: string;
  companyOrBranchName: string;
  requesterName: string;
  vehicleNo: string;
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

/** 미입력 필수 필드를 안내 배너에 나열할 때 쓰는 항목명. FormField 라벨과 맞춘다. */
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  companyOrBranchName: '회사명',
  requesterName: '성명',
  requesterEmail: '이메일',
  vehicleNo: '차량번호',
  hostEmployeeUserId: '당사 담당자',
  visitStartAt: '입차 예정 시간',
  visitEndAt: '출차 예정 시간',
  visitPurpose: '방문 목적',
  privacyConsent: '개인정보 수집 및 이용 동의',
  visitorConsentConfirmed: '방문객 개인정보 수집·이용 동의 확인',
  securityPledgeConsent: '보안서약서 동의',
  visitorSecurityPledgeConfirmed: '방문객 보안서약서 동의 확인',
};

/** 보안서약서 본문(직원 본인 방문 제외 전부에 동일하게 노출). */
const SECURITY_PLEDGE_ITEMS = [
  '회사로부터 사전에 허가받지 않은 구역, 시스템 및 정보에 접근하거나 열람하지 않겠습니다.',
  '방문 중 알게 된 회사의 생산·기술·경영 정보를 방문 목적 외의 용도로 사용하지 않으며, 제3자에게 누설 또는 공유하지 않겠습니다. 방문 목적이 종료되면 제공받은 자료를 지체 없이 삭제 또는 파기하겠습니다.',
  '회사의 사전 허가 없이 생산라인·설비 등 회사 시설을 촬영하거나, 비인가 촬영 장비를 반입하지 않겠습니다.',
  '담당자의 안내 및 현장 안전수칙을 준수하며, 지정된 구역과 동선을 벗어나지 않겠습니다.',
];

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
  securityPledgeConsent: boolean;
};

function buildInitialState(
  initialValues: ReservationFormInitialValues | undefined,
  defaultDateTimeInput: string,
): FormState {
  return {
    companyOrBranchName: initialValues?.companyOrBranchName ?? '',
    requesterName: initialValues?.requesterName ?? '',
    requesterEmail: initialValues?.requesterEmail ?? '',
    vehicleNo: initialValues?.vehicleNo ?? '',
    visitPurpose: '',
    requestMemo: '',
    visitStartAt: defaultDateTimeInput,
    visitEndAt: '',
    privacyConsent: false,
    securityPledgeConsent: false,
  };
}

export function ReservationForm({
  mode,
  settings,
  initialValues,
}: {
  mode: ReservationFormMode;
  settings: Settings;
  initialValues?: ReservationFormInitialValues;
}) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(initialValues, settings.defaultDateTimeInput),
  );
  // visitor: 회원 프로필의 담당자. employee-proxy: 로그인한 직원 본인. 둘 다 화면에서 바꿀 수 없다.
  const hostEmployee = initialValues?.hostEmployee ?? null;
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

  /**
   * 버튼을 비활성화하는 대신, 제출 시점에 빈 필수 필드를 찾아 서버와 동일한 문구로
   * fieldErrors 를 채운다. 어떤 필드가 비었는지 빨간 테두리 + 안내 문구로 바로 보여주기 위함.
   */
  function findRequiredFieldErrors(): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    // visitor 는 회사명/성명/이메일/차량번호/담당자가 전부 회원 프로필에서 온 읽기 전용 값이라
    // 검증할 입력 자체가 없다(페이지 진입 시점에 프로필 완결성을 이미 확인했다).
    if (mode !== 'visitor') {
      if (form.companyOrBranchName.trim() === '') {
        errors.companyOrBranchName = [
          mode === 'employee-self' ? '소속 사업장명을 입력해 주세요.' : '회사명을 입력해 주세요.',
        ];
      }
      if (form.requesterName.trim() === '') {
        errors.requesterName = ['성명을 입력해 주세요.'];
      }
      if (form.requesterEmail.trim() === '') {
        errors.requesterEmail = ['이메일을 입력해 주세요.'];
      }
      if (form.vehicleNo.trim() === '') {
        errors.vehicleNo = ['차량번호를 입력해 주세요.'];
      }
    }
    if (form.visitStartAt === '') {
      errors.visitStartAt = ['날짜와 시간을 입력해 주세요.'];
    }
    if (form.visitEndAt === '') {
      errors.visitEndAt = ['날짜와 시간을 입력해 주세요.'];
    }
    if (form.visitPurpose.trim() === '') {
      errors.visitPurpose = ['방문 목적을 입력해 주세요.'];
    }
    if (mode !== 'employee-self' && !form.privacyConsent) {
      const consentKey = mode === 'employee-proxy' ? 'visitorConsentConfirmed' : 'privacyConsent';
      errors[consentKey] = [
        mode === 'employee-proxy'
          ? '방문객 개인정보 수집·이용 동의 확인이 필요합니다.'
          : '개인정보 수집 및 이용에 동의해 주세요.',
      ];
    }
    if (mode !== 'employee-self' && !form.securityPledgeConsent) {
      const pledgeKey =
        mode === 'employee-proxy' ? 'visitorSecurityPledgeConfirmed' : 'securityPledgeConsent';
      errors[pledgeKey] = [
        mode === 'employee-proxy'
          ? '방문객 보안서약서 동의 확인이 필요합니다.'
          : '보안서약서에 동의해 주세요.',
      ];
    }

    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const clientErrors = findRequiredFieldErrors();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      const missingLabels = Object.keys(clientErrors).map(
        (key) => REQUIRED_FIELD_LABELS[key] ?? key,
      );
      setFormError({
        code: 'VALIDATION_ERROR',
        message: `다음 항목을 입력해 주세요: ${missingLabels.join(', ')}`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const scheduleAndMemo = {
      visitPurpose: form.visitPurpose,
      requestMemo: form.requestMemo || null,
      visitStartAt: form.visitStartAt,
      visitEndAt: form.visitEndAt,
    };
    // visitor: 회사명/성명/이메일/차량번호/담당자는 서버가 로그인 세션의 회원 프로필에서
    // 직접 읽으므로 아예 보내지 않는다(화면에도 안 보이는 값을 클라이언트가 조작해 보내는
    // 경로 자체를 없앤다). employee-proxy: 담당자는 항상 신청 중인 직원 본인으로 서버가
    // 고정하므로 마찬가지로 보내지 않는다.
    const basePayload = {
      companyOrBranchName: form.companyOrBranchName,
      requesterName: form.requesterName,
      requesterEmail: form.requesterEmail,
      vehicleNo: form.vehicleNo,
      ...scheduleAndMemo,
    };
    const payload =
      mode === 'visitor'
        ? {
            ...scheduleAndMemo,
            privacyConsent: form.privacyConsent,
            securityPledgeConsent: form.securityPledgeConsent,
          }
        : mode === 'employee-proxy'
          ? {
              ...basePayload,
              visitorConsentConfirmed: form.privacyConsent,
              visitorSecurityPledgeConfirmed: form.securityPledgeConsent,
            }
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
    return <CompletionView mode={mode} result={result} settings={settings} />;
  }

  // 서버 검증 오류 필드명이 모드별로 다르다(privacyConsent vs visitorConsentConfirmed).
  const consentFieldErrors =
    mode === 'employee-proxy' ? fieldErrors.visitorConsentConfirmed : fieldErrors.privacyConsent;
  const pledgeFieldErrors =
    mode === 'employee-proxy'
      ? fieldErrors.visitorSecurityPledgeConfirmed
      : fieldErrors.securityPledgeConsent;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="mb-4">
          <Alert variant="error" title="신청을 완료하지 못했습니다">
            {formError.message}
          </Alert>
        </div>
      )}

      {mode === 'visitor' ? (
        <div className="card">
          <div className="card-body space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="card-title">신청자 정보</h2>
              <Link href="/mypage" className="text-brand-700 text-xs font-semibold">
                수정하러 가기 →
              </Link>
            </div>
            <p className="field-hint">
             기본 정보는 마이페이지에서
              변경해 주세요.
            </p>
            <dl>
              <Row term="회사명" desc={form.companyOrBranchName} />
              <Row term="성명" desc={form.requesterName} />
              <Row term="이메일" desc={form.requesterEmail} />
              <Row term="차량번호" desc={form.vehicleNo} />
              <Row term="당사 담당자" desc={hostEmployee?.label ?? ''} />
            </dl>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body space-y-5">
            <FormField
              label={mode === 'employee-self' ? '소속 사업장명' : '회사명'}
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
                placeholder={mode === 'employee-self' ? '동탄' : undefined}
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
                disabled={mode === 'employee-self'}
                readOnly={mode === 'employee-self'}
              />
            </FormField>

            <FormField
              label="이메일"
              htmlFor="requesterEmail"
              required
              hint={
                mode === 'employee-self' ? undefined : '신청 결과와 예약 조회 링크를 보내드립니다.'
              }
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
                disabled={mode === 'employee-self'}
                readOnly={mode === 'employee-self'}
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

            {mode === 'employee-proxy' && (
              <FormField label="당사 담당자" htmlFor="hostEmployeeLabel">
                <input
                  id="hostEmployeeLabel"
                  className={inputClassName(false)}
                  value={hostEmployee?.label ?? ''}
                  disabled
                  readOnly
                />
                <p className="field-hint mt-1">대리 신청은 담당자가 본인으로 고정됩니다.</p>
              </FormField>
            )}
          </div>
        </div>
      )}

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

          <FormField
            label="방문 목적"
            htmlFor="visitPurpose"
            required
            errors={fieldErrors.visitPurpose}
          >
            <input
              id="visitPurpose"
              name="visitPurpose"
              className={inputClassName(Boolean(fieldErrors.visitPurpose))}
              value={form.visitPurpose}
              onChange={(event) => update('visitPurpose', event.target.value)}
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

          <Alert variant="info" title="주차 위치 안내">
            {settings.spaceAssignmentEnabled
              ? '주차 위치는 관리자가 배정합니다. 신청자가 직접 선택할 수 없습니다.'
              : '주차 위치는 지정되지 않습니다. 관리자 승인 후 방문하시어 현장 안내에 따라 주차해 주세요.'}
          </Alert>
        </div>
      </div>

      {mode !== 'employee-self' && (
        <div className="card mt-4">
          <div className="card-body">
            <h2 className="card-title">보안서약서 동의</h2>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              <p>
                시노펙스(이하 &quot;회사&quot;라 합니다)를 방문하는 방문자 본인은 다음의 보안 및
                안전에 관한 내용에 동의하며, 성실히 준수할 것을 서약합니다.
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                {SECURITY_PLEDGE_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>

            <label
              htmlFor="securityPledgeConsent"
              className={`mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                pledgeFieldErrors ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
              }`}
            >
              <input
                id="securityPledgeConsent"
                name="securityPledgeConsent"
                type="checkbox"
                className="accent-brand-700 size-5 shrink-0"
                checked={form.securityPledgeConsent}
                onChange={(event) => update('securityPledgeConsent', event.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-800">
                {mode === 'employee-proxy'
                  ? '방문객에게 위 보안서약 내용을 안내하였고, 방문객으로부터 보안서약서 동의를 확인하였습니다.'
                  : '상기 내용을 확인하였으며, 보안서약서에 동의합니다.'}
              </span>
            </label>
            {pledgeFieldErrors && (
              <p className="field-error" role="alert">
                {pledgeFieldErrors[0]}
              </p>
            )}
          </div>
        </div>
      )}

      {mode !== 'employee-self' && (
        <div className="card mt-4">
          <div className="card-body">
            <h2 className="card-title">개인정보 수집 및 이용 동의</h2>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              {mode === 'visitor' ? (
                <>
                  <p>
                    <strong>수집 항목</strong> : 방문 일정, 방문 목적
                  </p>
                  <p className="mt-2">
                    <strong>수집 목적</strong> : 방문 차량 방문 예약 접수·승인, 주차면 배정, 방문 관련
                    안내 메일 발송
                  </p>
                  <p className="mt-2">
                    <strong>보유 기간</strong> : 이 방문 건은 방문 종료 후{' '}
                    {settings.personalDataRetentionDays}일간 보관 후 파기됩니다.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>수집 항목</strong> : 성명, 이메일, 차량번호, 소속(회사명/사업장), 방문 목적
                  </p>
                  <p className="mt-2">
                    <strong>수집 목적</strong> : 방문 차량 방문 예약 접수·승인, 주차면 배정, 방문 관련
                    안내 메일 발송
                  </p>
                  <p className="mt-2">
                    <strong>보유 기간</strong> : 방문 종료 후 {settings.personalDataRetentionDays}일간
                    보관 후 파기
                  </p>
                </>
              )}
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
          disabled={submitting}
        >
          {submitting ? '신청 중…' : '방문 신청하기'}
        </button>
      </div>
    </form>
  );
}

/** 완료 화면 "신청구분" — 기존 내비게이션에서 쓰는 문구와 맞춘다. */
const REQUEST_TYPE_LABEL: Record<ReservationFormMode, string> = {
  visitor: '방문 신청',
  'employee-self': '내 방문신청',
  'employee-proxy': '방문객 대리 신청',
};

function CompletionView({
  mode,
  result,
  settings,
}: {
  mode: ReservationFormMode;
  result: CreateResponse;
  settings: Settings;
}) {
  const isEmployee = mode !== 'visitor';
  const primaryHref = isEmployee
    ? `/employee/reservations/${result.reservationId}`
    : `/mypage/reservations/${result.reservationId}`;

  return (
    <div className="card" data-testid="reservation-complete">
      <div className="card-body">
        <div className="text-center">
          <div className="bg-brand-100 text-brand-700 mx-auto flex size-14 items-center justify-center rounded-full">
            <CarIcon />
          </div>
          <h2 className="mt-3 text-xl font-black text-slate-900">방문 신청이 접수되었습니다</h2>
          <p className="mt-1 text-sm text-slate-600">
            관리자 승인 후 결과를 이메일로 안내드립니다.
          </p>
        </div>

        <dl className="mt-5 divide-y divide-slate-100">
          <InfoRow icon={<DocumentIcon />} term="예약번호">
            <span className="font-mono font-bold" data-testid="reservation-no">
              {result.reservationNo}
            </span>
          </InfoRow>
          <InfoRow icon={<TagIcon />} term="신청구분">
            {REQUEST_TYPE_LABEL[mode]}
          </InfoRow>
          <InfoRow icon={<BuildingIcon />} term="사업장">
            {result.companyOrBranchName}
          </InfoRow>
          <InfoRow icon={<PersonIcon />} term="신청자">
            {result.requesterName}
          </InfoRow>
          <InfoRow icon={<CarIcon />} term="차량번호">
            <span className="font-mono">{result.vehicleNo}</span>
          </InfoRow>
          <InfoRow icon={<ClockIcon />} term="방문 일정">
            {result.visitRangeText}
          </InfoRow>
          <InfoRow icon={<TagIcon />} term="예약 상태">
            <span className="badge bg-amber-100 text-amber-800">승인 대기</span>
          </InfoRow>
        </dl>

        <div className="border-line bg-surface-muted mt-5 rounded-lg border p-4">
          <h3 className="text-ink text-sm font-bold">유의사항</h3>
          <ul className="text-ink-muted mt-2 space-y-1.5 text-xs leading-relaxed">
            <li>
              • 방문 {settings.reservationMinLeadMinutes}분 전까지는 신청 내용을 수정·취소할 수
              있습니다.
            </li>
            <li>
              •{' '}
              {settings.spaceAssignmentEnabled
                ? '주차 위치는 관리자가 배정합니다. 배정 결과는 예약 조회에서 확인해 주세요.'
                : '주차 위치는 지정되지 않습니다. 승인 후 현장 안내에 따라 주차해 주세요.'}
            </li>
            <li>
              • {result.emailNoticeSentTo} 주소로 접수 확인 메일을 보냈습니다. 메일이 도착하지
              않으면 스팸함을 확인해 주세요.
            </li>
          </ul>
        </div>

        <div className="mt-5 space-y-2">
          <Link href={primaryHref} className="btn btn-primary w-full">
            내 예약 조회하기
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  term,
  children,
}: {
  icon: React.ReactNode;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <span className="bg-surface-hover text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <dt className="text-ink-faint w-20 shrink-0 text-xs font-bold">{term}</dt>
      <dd className="text-ink min-w-0 flex-1 truncate">{children}</dd>
    </div>
  );
}

function CarIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 16.5V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M5 11h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={8} r={3.5} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x={5} y={3.5} width={10} height={17} rx={1} stroke="currentColor" strokeWidth={1.8} />
      <path d="M15 10.5h4v10h-4" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.5 3.5H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l6.5-6.5a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={8} cy={8} r={1.3} fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={8.5} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
