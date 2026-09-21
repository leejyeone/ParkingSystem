'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { CompanyVehicleRequestForm } from '@/components/employee/company-vehicle-request-form';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest, type ApiErrorPayload } from '@/lib/client/api-client';

type Props = {
  tripId: number;
  employeeName: string;
  minDateTimeInput: string;
  reservationMinLeadMinutes: number;
  operatingStartTime: string;
  operatingEndTime: string;
  maxUsageHours: number;
  initial: {
    destination: string;
    reason: string;
    vehicleId: number;
    date: string;
    requestStartAt: string;
    requestEndAt: string;
  };
};

/**
 * 승인 대기 상태에서만 보이는 신청자 본인 수정·취소 패널 — 방문 예약
 * (`ReservationAccessPanel`)과 같은 모양(버튼 두 개가 한 카드 안에 나란히)으로,
 * `mode: 'idle' | 'edit' | 'cancel'` 하나로 전환한다. 실제 입력 폼(차량·시간 선택)은
 * 신청 폼(`CompanyVehicleRequestForm`)을 mode="edit"로 그대로 재사용한다.
 */
export function CompanyVehicleTripActionsPanel({ tripId, initial, ...formSettings }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'edit' | 'cancel'>('idle');
  const [cancelReason, setCancelReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCancelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest(`/api/company-vehicle-trips/${tripId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancelReason }),
    });

    setSubmitting(false);

    if (response.ok) {
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setFormError(response.error);
  }

  if (mode === 'edit') {
    return (
      <CompanyVehicleRequestForm
        {...formSettings}
        mode="edit"
        tripId={tripId}
        initial={initial}
        onCancel={() => setMode('idle')}
        onSuccess={() => {
          router.refresh();
          setMode('idle');
        }}
      />
    );
  }

  if (mode === 'cancel') {
    return (
      <form onSubmit={handleCancelSubmit} noValidate className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">신청 취소</h2>
          <Alert variant="warning">취소하면 되돌릴 수 없습니다. 다시 신청하려면 새로 작성해 주세요.</Alert>

          {formError && <Alert variant="error">{formError.message}</Alert>}

          <FormField label="취소 사유" htmlFor="trip-cancel-reason" required errors={fieldErrors.cancelReason}>
            <textarea
              id="trip-cancel-reason"
              rows={3}
              className={inputClassName(Boolean(fieldErrors.cancelReason))}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="예) 일정 변경"
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
            <button type="submit" className="btn btn-danger" disabled={submitting || !cancelReason.trim()}>
              {submitting ? '취소 처리 중…' : '취소하기'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}>
            신청 수정하기
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setMode('cancel')}>
            신청 취소하기
          </button>
        </div>
      </div>
    </section>
  );
}
