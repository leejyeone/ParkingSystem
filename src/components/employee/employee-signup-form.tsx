'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

/**
 * 직원 회원가입 폼.
 * 그룹웨어 SSO 연동 전까지 직원 계정은 이 폼으로 직접 가입한다.
 */
export function EmployeeSignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    branchName: '',
    department: '',
    vehicleNo: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    setErrorMessage(null);
    setFieldErrors({});

    const response = await apiRequest<{ name: string }>('/api/employee/auth/signup', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    if (response.ok) {
      router.replace('/employee');
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

        <FormField
          label="이메일"
          htmlFor="employee-signup-email"
          required
          errors={fieldErrors.email}
        >
          <input
            id="employee-signup-email"
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
          htmlFor="employee-signup-password"
          required
          hint="8자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
          errors={fieldErrors.password}
        >
          <input
            id="employee-signup-password"
            type="password"
            className={inputClassName(Boolean(fieldErrors.password))}
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            autoComplete="new-password"
            maxLength={100}
          />
        </FormField>

        <FormField label="성명" htmlFor="employee-signup-name" required errors={fieldErrors.name}>
          <input
            id="employee-signup-name"
            className={inputClassName(Boolean(fieldErrors.name))}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            autoComplete="name"
            maxLength={50}
          />
        </FormField>

        <FormField
          label="소속 사업장명"
          htmlFor="employee-signup-company"
          required
          errors={fieldErrors.branchName}
        >
          <input
            id="employee-signup-company"
            className={inputClassName(Boolean(fieldErrors.branchName))}
            value={form.branchName}
            onChange={(event) => update('branchName', event.target.value)}
            placeholder="예) 시노펙스 / 대구사업장"
            autoComplete="organization"
            maxLength={100}
          />
        </FormField>

        <FormField
          label="부서"
          htmlFor="employee-signup-department"
          hint="선택 입력입니다."
          errors={fieldErrors.department}
        >
          <input
            id="employee-signup-department"
            className={inputClassName(Boolean(fieldErrors.department))}
            value={form.department}
            onChange={(event) => update('department', event.target.value)}
            maxLength={100}
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="employee-signup-vehicle"
          hint="선택 입력입니다. 저장해 두면 방문 신청 시 자동으로 입력됩니다."
          errors={fieldErrors.vehicleNo}
        >
          <input
            id="employee-signup-vehicle"
            className={inputClassName(Boolean(fieldErrors.vehicleNo))}
            value={form.vehicleNo}
            onChange={handleVehicleNoChange}
            placeholder="12가3456"
            maxLength={20}
          />
        </FormField>

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
          {submitting ? '가입 중…' : '가입하고 시작하기'}
        </button>
      </div>
    </form>
  );
}
