'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

type Props = {
  tripId: number;
  initial: {
    odometerStartKm: string;
    odometerEndKm: string;
    manualDistanceKm: string;
  };
};

/**
 * 신청 직원 본인의 주행거리(계기판) 입력 카드. 승인 완료 후 반납 처리 전까지
 * (상세 페이지가 이 카드를 상태 APPROVED일 때만 렌더링) 몇 번이든 저장할 수 있다.
 */
export function CompanyVehicleTripMileagePanel({ tripId, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const response = await apiRequest(`/api/company-vehicle-trips/${tripId}/mileage`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (response.ok) {
      setSaved(true);
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setError(response.error.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-3">
        <h2 className="card-title">주행 기록</h2>
        <p className="field-hint">
          반납 처리 전까지 계기판 값을 입력·수정할 수 있습니다.
        </p>

        {error && <Alert variant="error">{error}</Alert>}
        {saved && <Alert variant="success">저장되었습니다.</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="출발 전 계기판(km)"
            htmlFor="mileage-start"
            errors={fieldErrors.odometerStartKm}
          >
            <input
              id="mileage-start"
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClassName(Boolean(fieldErrors.odometerStartKm))}
              value={form.odometerStartKm}
              onChange={(event) => update('odometerStartKm', event.target.value)}
            />
          </FormField>
          <FormField
            label="도착 후 계기판(km)"
            htmlFor="mileage-end"
            errors={fieldErrors.odometerEndKm}
          >
            <input
              id="mileage-end"
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClassName(Boolean(fieldErrors.odometerEndKm))}
              value={form.odometerEndKm}
              onChange={(event) => update('odometerEndKm', event.target.value)}
            />
          </FormField>
        </div>
        <FormField
          label="주행거리 직접 입력(km)"
          htmlFor="mileage-manual"
          hint="계기판을 확인할 수 없으면 이 칸에 주행거리만 입력해도 됩니다."
          errors={fieldErrors.manualDistanceKm}
        >
          <input
            id="mileage-manual"
            type="number"
            min={0}
            inputMode="numeric"
            className={inputClassName(Boolean(fieldErrors.manualDistanceKm))}
            value={form.manualDistanceKm}
            onChange={(event) => update('manualDistanceKm', event.target.value)}
          />
        </FormField>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  );
}
