'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';

/** 승인 완료(APPROVED) 상태에서만 보이는 신청자 본인의 "반납 처리" 패널. */
export function CompanyVehicleTripReturnPanel({ tripId }: { tripId: number }) {
  const router = useRouter();
  // 버튼을 누른 시각이 아니라 실제로 차를 반납한 시각을 남길 수 있게 한다(관리자 입/출차
  // 시각 입력과 같은 이유). 기본값은 "지금"이지만 자유롭게 고쳐서 늦게 처리해도 실제
  // 시각을 기록할 수 있다.
  const [actualEntryAt, setActualEntryAt] = useState(() => utcToZonedInput(new Date()));
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleReturn() {
    if (!window.confirm('차량을 반납하셨나요? 반납 처리하면 관리자에게 확인 요청이 갑니다.')) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest(`/api/company-vehicle-trips/${tripId}/return`, {
      method: 'POST',
      body: JSON.stringify({ actualEntryAt }),
    });

    setSubmitting(false);

    if (response.ok) {
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
  }

  return (
    <section className="card">
      <div className="card-body space-y-3">
        <h2 className="card-title">반납 처리</h2>
        <p className="field-hint">
          운행을 마치고 차량을 반납했다면 실제 반납 시각을 확인한 뒤 아래 버튼을 눌러
          주세요. 관리자에게 알림이 가고, 관리자가 차량 상태를 확인하면 반납이 최종
          확정됩니다.
        </p>
        {formError && <Alert variant="error">{formError.message}</Alert>}
        <FormField
          label="실제 반납 시각"
          htmlFor="return-actual-entry-at"
          errors={fieldErrors.actualEntryAt}
        >
          <input
            id="return-actual-entry-at"
            type="datetime-local"
            className={inputClassName(Boolean(fieldErrors.actualEntryAt))}
            value={actualEntryAt}
            onChange={(event) => setActualEntryAt(event.target.value)}
          />
        </FormField>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={submitting}
          onClick={handleReturn}
        >
          {submitting ? '처리 중…' : '반납 처리'}
        </button>
      </div>
    </section>
  );
}
