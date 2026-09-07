'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 회원 탈퇴. `UserProfilePanel`이 카드 전체를 하나의 <form>으로 쓰고 있어 그 안에
 * 넣을 수 없으므로(중첩 form 불가) 별도 카드로 분리한다.
 * 파괴적 동작이라 버튼을 바로 제출하지 않고, 비밀번호 확인 단계를 한 번 거친다.
 */
export function UserDeleteAccountPanel() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetConfirm() {
    setConfirming(false);
    setPassword('');
    setErrorMessage(null);
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const response = await apiRequest('/api/my/profile', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.replace('/');
      router.refresh();
      return;
    }

    setSubmitting(false);
    setErrorMessage(response.error.message);
  }

  return (
    <div className="card">
      <div className="card-body space-y-3">
        <h2 className="card-title">회원 탈퇴</h2>
        <p className="field-hint">
          신청하신 방문 예약 기록은 삭제되지 않습니다.
        </p>

        {!confirming ? (
          <button
            type="button"
            className="btn btn-danger w-full"
            onClick={() => setConfirming(true)}
          >
            회원 탈퇴
          </button>
        ) : (
          <form onSubmit={handleDelete} noValidate className="space-y-3">
            {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
            <FormField label="비밀번호 확인" htmlFor="delete-account-password" required>
              <PasswordInput
                id="delete-account-password"
                className={inputClassName(false)}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-secondary" onClick={resetConfirm}>
                취소
              </button>
              <button type="submit" className="btn btn-danger" disabled={submitting}>
                {submitting ? '처리 중…' : '정말 탈퇴합니다'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
