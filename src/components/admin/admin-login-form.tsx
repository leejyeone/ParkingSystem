'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';

export function AdminLoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    const response = await apiRequest<{ adminName: string }>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      router.replace(redirectTo);
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
        <Alert variant="info">
          그룹웨어 이메일과 비밀번호를 입력하세요. <br/>초기 비밀번호는 Synopex123!@# 입니다. <br/>로그인 후 상단바의 본인 이름을 눌러 비밀번호를 변경해주세요.
        </Alert>

        {errorMessage && (
          <Alert variant="error" title="로그인할 수 없습니다">
            {errorMessage}
          </Alert>
        )}

        <FormField label="이메일" htmlFor="email" required errors={fieldErrors.email}>
          <input
            id="email"
            name="email"
            type="email"
            className={inputClassName(Boolean(fieldErrors.email))}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            maxLength={255}
          />
        </FormField>

        <FormField label="비밀번호" htmlFor="password" required errors={fieldErrors.password}>
          <PasswordInput
            id="password"
            name="password"
            className={inputClassName(Boolean(fieldErrors.password))}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            maxLength={100}
          />
        </FormField>

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>

        <p className="text-ink-faint text-center text-xs">
          로그인 실패가 5회 누적되면 계정이 10분간 잠금됩니다.
        </p>
      </div>
    </form>
  );
}
