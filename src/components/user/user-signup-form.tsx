'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';
import { formatPhoneInput } from '@/lib/phone';
import { normalizeVehicleNo } from '@/lib/vehicle';

type VerifiedHostEmployee = { employeeUserId: number; name: string; departmentName: string };

/**
 * 회원가입 폼.
 * 여기서 저장한 정보가 방문 신청 폼 자동완성에 그대로 사용된다.
 */
export function UserSignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    companyOrBranchName: '',
    vehicleNo: '',
    hostEmployeeName: '',
    hostEmployeePhone: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // "당사 담당자" 확인 상태. 확인되기 전까지는 가입 제출을 막는다.
  const [hostEmployee, setHostEmployee] = useState<VerifiedHostEmployee | null>(null);
  const [hostEmployeeVerifying, setHostEmployeeVerifying] = useState(false);
  const [hostEmployeeError, setHostEmployeeError] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    update('vehicleNo', normalizeVehicleNo(event.target.value));
  }

  async function handleVerifyHostEmployee() {
    setHostEmployeeVerifying(true);
    setHostEmployeeError(null);

    const response = await apiRequest<VerifiedHostEmployee>('/api/employees/verify-host', {
      method: 'POST',
      body: JSON.stringify({ name: form.hostEmployeeName, phone: form.hostEmployeePhone }),
    });

    setHostEmployeeVerifying(false);
    if (response.ok) {
      setHostEmployee(response.data);
      return;
    }
    setHostEmployeeError(response.error.message);
  }

  function resetHostEmployee() {
    setHostEmployee(null);
    setHostEmployeeError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hostEmployee) {
      setErrorMessage('당사 담당자를 먼저 확인해 주세요.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    const response = await apiRequest<{ name: string; linkedReservationCount: number }>(
      '/api/auth/signup',
      { method: 'POST', body: JSON.stringify(form) },
    );

    if (response.ok) {
      // 가입 목적이 방문 신청이므로, 가입 완료 후 바로 신청 폼으로 보낸다.
      router.replace('/reservations/new');
      router.refresh();
      return;
    }

    setSubmitting(false);
    setFieldErrors(response.error.fieldErrors ?? {});
    setErrorMessage(response.error.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-5">
        {errorMessage && (
          <Alert variant="error" title="가입할 수 없습니다">
            {errorMessage}
          </Alert>
        )}

        <FormField label="이메일" htmlFor="signup-email" required errors={fieldErrors.email}>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            className={inputClassName(Boolean(fieldErrors.email))}
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            autoComplete="email"
            maxLength={255}
          />
        </FormField>

        <FormField
          label="비밀번호"
          htmlFor="signup-password"
          required
          hint="8자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
          errors={fieldErrors.password}
        >
          <PasswordInput
            id="signup-password"
            className={inputClassName(Boolean(fieldErrors.password))}
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            autoComplete="new-password"
            maxLength={100}
          />
        </FormField>

        <FormField label="성명" htmlFor="signup-name" required errors={fieldErrors.name}>
          <input
            id="signup-name"
            className={inputClassName(Boolean(fieldErrors.name))}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            autoComplete="name"
            maxLength={50}
          />
        </FormField>

        <FormField
          label="회사명"
          htmlFor="signup-company"
          required
          errors={fieldErrors.companyOrBranchName}
        >
          <input
            id="signup-company"
            className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
            value={form.companyOrBranchName}
            onChange={(event) => update('companyOrBranchName', event.target.value)}
            autoComplete="organization"
            maxLength={100}
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="signup-vehicle"
          required
          errors={fieldErrors.vehicleNo}
        >
          <input
            id="signup-vehicle"
            className={inputClassName(Boolean(fieldErrors.vehicleNo))}
            value={form.vehicleNo}
            onChange={handleVehicleNoChange}
            placeholder="12가3456"
            maxLength={20}
          />
        </FormField>

        <div>
          <p className="label label-required">당사 담당자</p>
          {hostEmployee ? (
            <div className="flex items-center gap-2">
              <input
                className={`${inputClassName(false)} flex-1`}
                value={`${hostEmployee.name} (${hostEmployee.departmentName})`}
                readOnly
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0 px-2 py-1 text-xs"
                onClick={resetHostEmployee}
              >
                다시 검색
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {hostEmployeeError && <Alert variant="error">{hostEmployeeError}</Alert>}
              <div className="flex gap-2">
                <input
                  className={`${inputClassName(false)} flex-1`}
                  placeholder="담당자 이름"
                  value={form.hostEmployeeName}
                  onChange={(event) => update('hostEmployeeName', event.target.value)}
                  maxLength={50}
                />
                <input
                  className={`${inputClassName(false)} flex-1`}
                  placeholder="담당자 전화번호"
                  inputMode="numeric"
                  value={form.hostEmployeePhone}
                  onChange={(event) =>
                    update('hostEmployeePhone', formatPhoneInput(event.target.value))
                  }
                  maxLength={13}
                />
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 px-3 text-xs"
                  disabled={
                    hostEmployeeVerifying ||
                    !form.hostEmployeeName.trim() ||
                    !form.hostEmployeePhone.trim()
                  }
                  onClick={handleVerifyHostEmployee}
                >
                  {hostEmployeeVerifying ? '검색 중…' : '검색'}
                </button>
              </div>
              <p className="field-hint">
                이름과 전화번호가 모두 일치해야 확인됩니다. 방문 신청 시 이 담당자에게 안내
                메일이 발송됩니다.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-700">개인정보 수집 및 이용 안내</p>
          <p className="mt-1">
            <strong>수집 항목</strong> : 이메일, 비밀번호, 성명, 회사명, 차량번호, 당사 담당자
          </p>
          <p className="mt-1">
            <strong>수집 목적</strong> : 회원 계정 생성, 방문 신청 시 정보 자동 입력
          </p>
          <p className="mt-1">
            <strong>보유 기간</strong> : 회원 탈퇴 시까지 보관 후 파기
          </p>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={submitting || !hostEmployee}
        >
          {submitting ? '가입 중…' : '가입하고 시작하기'}
        </button>
      </div>
    </form>
  );
}
