'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';

/**
 * 예약번호로 예약을 조회하는 폼.
 *
 * 조회에 성공하면 서버가 짧은 유효시간의 접근 경로(/r/<token>)를 돌려주고,
 * 이후 조회·수정·취소는 기존 토큰 기반 화면을 그대로 사용한다.
 */
export function ReservationLookupForm() {
  const router = useRouter();
  const [reservationNo, setReservationNo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    const response = await apiRequest<{ accessPath: string }>('/api/reservations/lookup', {
      method: 'POST',
      body: JSON.stringify({ reservationNo }),
    });

    if (response.ok) {
      router.push(response.data.accessPath);
      return;
    }

    setSubmitting(false);
    setFieldErrors(response.error.fieldErrors ?? {});
    setErrorMessage((response.error as ApiErrorPayload).message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-4">
        <h2 className="card-title">예약번호로 조회</h2>

        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

        <FormField
          label="예약번호"
          htmlFor="reservationNo"
          required
          hint="신청 완료 화면과 접수 이메일에 표시된 번호입니다. 예) PK-20260820-ABCDEF"
          errors={fieldErrors.reservationNo}
        >
          <input
            id="reservationNo"
            name="reservationNo"
            className={`${inputClassName(Boolean(fieldErrors.reservationNo))} font-mono`}
            value={reservationNo}
            onChange={(event) => setReservationNo(event.target.value)}
            placeholder="PK-20260820-ABCDEF"
            maxLength={30}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </FormField>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={submitting || reservationNo.trim() === ''}
        >
          {submitting ? '조회 중…' : '예약 조회하기'}
        </button>
      </div>
    </form>
  );
}
