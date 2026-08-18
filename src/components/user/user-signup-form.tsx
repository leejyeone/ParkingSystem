'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

/**
 * 회원가입 폼.
 * 여기서 저장한 정보가 주차 신청 폼 자동완성에 그대로 사용된다.
 */
export function UserSignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    companyOrBranchName: '',
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

    const response = await apiRequest<{ name: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    if (response.ok) {
      router.replace('/mypage');
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
          hint="10자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
          errors={fieldErrors.password}
        >
          <input
            id="signup-password"
            type="password"
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
          label="방문 상호 또는 소속 지사명"
          htmlFor="signup-company"
          required
          errors={fieldErrors.companyOrBranchName}
        >
          <input
            id="signup-company"
            className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
            value={form.companyOrBranchName}
            onChange={(event) => update('companyOrBranchName', event.target.value)}
            placeholder="예) 시노펙스 / 대구지사"
            autoComplete="organization"
            maxLength={100}
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="signup-vehicle"
          hint="선택 입력입니다. 저장해 두면 주차 신청 시 자동으로 입력됩니다."
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

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
          {submitting ? '가입 중…' : '가입하고 시작하기'}
        </button>
      </div>
    </form>
  );
}
