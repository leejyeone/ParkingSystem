'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';

/** 승인 완료(APPROVED) 상태에서만 보이는 신청자 본인의 "반납 처리" 패널. */
export function CompanyVehicleTripReturnPanel({ tripId }: { tripId: number }) {
  const router = useRouter();
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleReturn() {
    if (!window.confirm('차량을 반납하셨나요? 반납 처리하면 관리자에게 확인 요청이 갑니다.')) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const response = await apiRequest(`/api/company-vehicle-trips/${tripId}/return`, {
      method: 'POST',
    });

    setSubmitting(false);

    if (response.ok) {
      router.refresh();
      return;
    }

    setFormError(response.error);
  }

  return (
    <section className="card">
      <div className="card-body space-y-3">
        <h2 className="card-title">반납 처리</h2>
        <p className="field-hint">
          운행을 마치고 차량을 반납했다면 아래 버튼을 눌러 주세요. 관리자에게 알림이 가고,
          관리자가 차량 상태를 확인하면 반납이 최종 확정됩니다.
        </p>
        {formError && <Alert variant="error">{formError.message}</Alert>}
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
