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
  /** 운행 신청 가능 시간대 종료 'HH:mm'(시스템 설정). */
  operatingEndTime: string;
  /** 1회 최대 사용 가능 시간(시스템 설정, 시간 단위). */
  maxUsageHours: number;
};

/**
 * 'yyyy-MM-ddTHH:mm' 문자열에 시간을 더한다. 실제 타임존 변환 없이 순수 문자열의
 * 날짜/시간 구성요소만 계산한다 — `Date.UTC`는 자정 넘김·말일 계산을 안전하게 하기 위한
 * 계산 도구로만 쓰고(브라우저 로컬 타임존과 무관), KST 실제 변환은 서버가 담당한다.
 */
function addHoursToLocalInput(value: string, hours: number): string {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute) + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}T${pad(result.getUTCHours())}:${pad(result.getUTCMinutes())}`;
}

/** 시작 시간 기준 "시작 + maxUsageHours"를 그날 운영 종료 시각으로 클램프한 값. */
function computeLatestEnd(startValue: string, operatingEndTime: string, maxUsageHours: number): string {
  const candidate = addHoursToLocalInput(startValue, maxUsageHours);
  const datePart = startValue.split('T')[0];
  const operatingEnd = `${datePart}T${operatingEndTime}`;
  return candidate < operatingEnd ? candidate : operatingEnd;
}

export function CompanyVehicleRequestForm({
  employeeName,
  minDateTimeInput,
  operatingEndTime,
  maxUsageHours,
}: Props) {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [requestStartAt, setRequestStartAt] = useState('');
  const [requestEndAt, setRequestEndAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function handleStartChange(value: string) {
    setRequestStartAt(value);
    if (value) {
      setRequestEndAt(computeLatestEnd(value, operatingEndTime, maxUsageHours));
    }
  }

  const endMax = requestStartAt
    ? computeLatestEnd(requestStartAt, operatingEndTime, maxUsageHours)
    : undefined;

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
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => router.push('/employee')}
          >
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
          <input
            id="company-vehicle-requester"
            className="input"
            value={employeeName}
            disabled
            readOnly
          />
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
            errors={fieldErrors.requestStartAt}
          >
            <input
              id="company-vehicle-start"
              type="datetime-local"
              min={minDateTimeInput}
              className={inputClassName(Boolean(fieldErrors.requestStartAt))}
              value={requestStartAt}
              onChange={(event) => handleStartChange(event.target.value)}
            />
          </FormField>
          <FormField
            label="운행 종료 예정 시간"
            htmlFor="company-vehicle-end"
            required
            hint={`최대 ${maxUsageHours}시간까지 신청 가능합니다.`}
            errors={fieldErrors.requestEndAt}
          >
            <input
              id="company-vehicle-end"
              type="datetime-local"
              min={requestStartAt || minDateTimeInput}
              max={endMax}
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
            submitting || !destination.trim() || !reason.trim() || !requestStartAt || !requestEndAt
          }
        >
          {submitting ? '신청 중…' : '법인 차량 신청'}
        </button>
      </div>
    </form>
  );
}
