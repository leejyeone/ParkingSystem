'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';

/** 승인 완료(APPROVED) 상태에서만 보이는 신청자 본인의 "반납 처리" 패널. */
export function CompanyVehicleTripReturnPanel({ tripId }: { tripId: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'confirm'>('idle');
  const [returnMemo, setReturnMemo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest(`/api/company-vehicle-trips/${tripId}/return`, {
      method: 'POST',
      body: JSON.stringify({ returnMemo: returnMemo.trim() || undefined }),
    });

    setSubmitting(false);

    if (response.ok) {
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
  }

  if (mode === 'idle') {
    return (
      <section className="card">
        <div className="card-body space-y-3">
          <h2 className="card-title">반납 처리</h2>
          <p className="field-hint">
            운행을 마치고 차량을 반납했다면 아래 버튼을 눌러 주세요. 관리자에게 알림이 가고,
            관리자가 차량 상태를 확인하면 반납이 최종 확정됩니다.
          </p>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setMode('confirm')}
          >
            반납 처리
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-4">
        <h2 className="card-title">반납 처리</h2>
        <Alert variant="info">
          반납 처리하면 관리자에게 확인 요청 알림이 발송됩니다. 관리자가 차량 상태를 확인하고
          확정해야 완전히 종료됩니다.
        </Alert>

        {formError && <Alert variant="error">{formError.message}</Alert>}

        <FormField
          label="비고 (선택)"
          htmlFor="return-memo"
          hint="차량 상태 등 관리자에게 전달할 내용이 있으면 적어 주세요."
          errors={fieldErrors.returnMemo}
        >
          <textarea
            id="return-memo"
            rows={2}
            className={inputClassName(Boolean(fieldErrors.returnMemo))}
            value={returnMemo}
            onChange={(event) => setReturnMemo(event.target.value)}
            maxLength={500}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setMode('idle')}
            disabled={submitting}
          >
            돌아가기
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '처리 중…' : '반납 처리 확정'}
          </button>
        </div>
      </div>
    </form>
  );
}
