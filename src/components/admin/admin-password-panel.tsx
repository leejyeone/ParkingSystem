'use client';

import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 본인 비밀번호 변경 패널. 다른 관리자의 비밀번호는 바꿀 수 없으므로,
 * 상단 내비게이션의 [관리자: 이름] 배지를 눌러 본인만 여기로 들어온다.
 */
export function AdminPasswordPanel({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setErrorMessage(null);
    setFieldErrors({});

    if (newPassword !== newPasswordConfirm) {
      setFieldErrors({ newPasswordConfirm: ['새 비밀번호가 서로 일치하지 않습니다.'] });
      return;
    }

    setSubmitting(true);

    const response = await apiRequest('/api/admin/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    setSubmitting(false);

    if (response.ok) {
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setErrorMessage(response.error.message);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-password-panel-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="닫기"
        onClick={onClose}
      />

      <div className="card relative w-full max-w-md">
        <form onSubmit={handleSubmit} noValidate>
          <div className="card-body space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 id="admin-password-panel-title" className="card-title">
                비밀번호 변경
              </h3>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                닫기
              </button>
            </div>

            {success ? (
              <Alert variant="success" title="비밀번호를 변경했습니다">
                다음 로그인부터 새 비밀번호를 사용해 주세요.
              </Alert>
            ) : (
              <>
                {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

                <FormField
                  label="현재 비밀번호"
                  htmlFor="current-password"
                  required
                  errors={fieldErrors.currentPassword}
                >
                  <PasswordInput
                    id="current-password"
                    className={inputClassName(Boolean(fieldErrors.currentPassword))}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    maxLength={100}
                  />
                </FormField>

                <FormField
                  label="새 비밀번호"
                  htmlFor="new-password"
                  required
                  hint="10자 이상, 영문 대/소문자·숫자·특수문자 중 3종류 이상"
                  errors={fieldErrors.newPassword}
                >
                  <PasswordInput
                    id="new-password"
                    className={inputClassName(Boolean(fieldErrors.newPassword))}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    maxLength={100}
                  />
                </FormField>

                <FormField
                  label="새 비밀번호 확인"
                  htmlFor="new-password-confirm"
                  required
                  errors={fieldErrors.newPasswordConfirm}
                >
                  <PasswordInput
                    id="new-password-confirm"
                    className={inputClassName(Boolean(fieldErrors.newPasswordConfirm))}
                    value={newPasswordConfirm}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                    autoComplete="new-password"
                    maxLength={100}
                  />
                </FormField>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-full"
                  disabled={submitting || !currentPassword || !newPassword || !newPasswordConfirm}
                >
                  {submitting ? '변경 중…' : '비밀번호 변경'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
