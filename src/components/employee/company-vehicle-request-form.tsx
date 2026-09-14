'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

type Props = {
  employeeName: string;
  /** 서버가 계산한 최소 선택 가능 시각('yyyy-MM-ddTHH:mm', KST). */
  minDateTimeInput: string;
};

export function CompanyVehicleRequestForm({ employeeName, minDateTimeInput }: Props) {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [requestStartAt, setRequestStartAt] = useState('');
  const [requestEndAt, setRequestEndAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest('/api/company-vehicle-trips', {
      method: 'POST',
      body: JSON.stringify({ destination, reason, requestStartAt, requestEndAt }),
    });

    setSubmitting(false);

    if (response.ok) {
      setDone(true);
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage(response.error.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) {
    return (
      <div className="card">
        <div className="card-body space-y-4 text-center">
          <h2 className="card-title">신청이 접수되었습니다</h2>
          <p className="text-ink-muted text-sm">
            관리자가 승인하면서 차량을 배정합니다. 처리 결과는 관리자에게 문의해 확인해 주세요.
          </p>
          <button type="button" className="btn btn-primary w-full" onClick={() => router.push('/employee')}>
            직원 홈으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-5">
        {message && <Alert variant="error">{message}</Alert>}

        <FormField label="운행 예정자" htmlFor="company-vehicle-requester">
          <input id="company-vehicle-requester" className="input" value={employeeName} disabled readOnly />
        </FormField>

        <FormField
          label="행선지"
          htmlFor="company-vehicle-destination"
          required
          errors={fieldErrors.destination}
        >
          <input
            id="company-vehicle-destination"
            className={inputClassName(Boolean(fieldErrors.destination))}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="예: 화성사업장"
            maxLength={200}
          />
        </FormField>

        <FormField label="사유" htmlFor="company-vehicle-reason" required errors={fieldErrors.reason}>
          <textarea
            id="company-vehicle-reason"
            rows={3}
            className={inputClassName(Boolean(fieldErrors.reason))}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="운행 시작 예정 시간"
            htmlFor="company-vehicle-start"
            required
            hint="10분 단위로 선택해 주세요."
            errors={fieldErrors.requestStartAt}
          >
            <input
              id="company-vehicle-start"
              type="datetime-local"
              step={600}
              min={minDateTimeInput}
              className={inputClassName(Boolean(fieldErrors.requestStartAt))}
              value={requestStartAt}
              onChange={(event) => setRequestStartAt(event.target.value)}
            />
          </FormField>
          <FormField
            label="운행 종료 예정 시간"
            htmlFor="company-vehicle-end"
            required
            hint="10분 단위로 선택해 주세요."
            errors={fieldErrors.requestEndAt}
          >
            <input
              id="company-vehicle-end"
              type="datetime-local"
              step={600}
              min={minDateTimeInput}
              className={inputClassName(Boolean(fieldErrors.requestEndAt))}
              value={requestEndAt}
              onChange={(event) => setRequestEndAt(event.target.value)}
            />
          </FormField>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={
            submitting ||
            !destination.trim() ||
            !reason.trim() ||
            !requestStartAt ||
            !requestEndAt
          }
        >
          {submitting ? '신청 중…' : '법인 차량 신청'}
        </button>
      </div>
    </form>
  );
}
