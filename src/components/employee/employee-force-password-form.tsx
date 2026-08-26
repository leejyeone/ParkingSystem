'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 첫 로그인 강제 비밀번호 변경 폼.
 * 관리자가 만든 계정은 고정된 초기 비밀번호로 로그인하므로, 현재 비밀번호 확인 없이
 * 새 비밀번호만 받는다(이미 그 비밀번호로 로그인에 성공한 세션이다).
 */
export function EmployeeForcePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setErrorMessage(null);
    setFieldErrors({});

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: ['새 비밀번호가 서로 일치하지 않습니다.'] });
      return;
    }

    setSubmitting(true);

    const response = await apiRequest('/api/employee/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });

    setSubmitting(false);

    if (response.ok) {
      router.replace('/employee');
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setErrorMessage(response.error.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-4">
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

        <FormField
          label="새 비밀번호"
          htmlFor="force-new-password"
          required
          hint="8자 이상"
          errors={fieldErrors.password}
        >
          <input
            id="force-new-password"
            type="password"
            className={inputClassName(Boolean(fieldErrors.password))}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            maxLength={100}
          />
        </FormField>

        <FormField
          label="새 비밀번호 확인"
          htmlFor="force-new-password-confirm"
          required
          errors={fieldErrors.passwordConfirm}
        >
          <input
            id="force-new-password-confirm"
            type="password"
            className={inputClassName(Boolean(fieldErrors.passwordConfirm))}
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            autoComplete="new-password"
            maxLength={100}
          />
        </FormField>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={submitting || !password || !passwordConfirm}
        >
          {submitting ? '변경 중…' : '비밀번호 변경하고 시작하기'}
        </button>
      </div>
    </form>
  );
}
