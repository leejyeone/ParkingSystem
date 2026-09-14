'use client';

import Link from 'next/link';
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

/** 'yyyy-MM-ddTHH:mm' → 'yyyy.MM.dd HH:mm'. 실제 타임존 변환 없이 문자열 그대로 표기한다. */
function formatDateTimeInput(value: string): string {
  const [datePart, timePart] = value.split('T');
  return `${datePart.replaceAll('-', '.')} ${timePart}`;
}

/** 같은 날짜면 종료 쪽은 시각만 보여준다(예: 2026.08.20 10:00 ~ 12:00). */
function formatDateTimeRange(startValue: string, endValue: string): string {
  const startDate = startValue.split('T')[0];
  const endDate = endValue.split('T')[0];
  const endTime = endValue.split('T')[1];
  return startDate === endDate
    ? `${formatDateTimeInput(startValue)} ~ ${endTime}`
    : `${formatDateTimeInput(startValue)} ~ ${formatDateTimeInput(endValue)}`;
}

export function CompanyVehicleRequestForm({
  employeeName,
  minDateTimeInput,
  operatingEndTime,
  maxUsageHours,
}: Props) {
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [requestStartAt, setRequestStartAt] = useState('');
  const [requestEndAt, setRequestEndAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<number | null>(null);

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

    const response = await apiRequest<{ tripId: number; tripStatus: string }>(
      '/api/company-vehicle-trips',
      {
        method: 'POST',
        body: JSON.stringify({ destination, reason, requestStartAt, requestEndAt }),
      },
    );

    setSubmitting(false);

    if (response.ok) {
      setCreatedTripId(response.data.tripId);
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage(response.error.message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (createdTripId !== null) {
    return (
      <div className="card" data-testid="company-vehicle-trip-complete">
        <div className="card-body">
          <div className="text-center">
            <div className="bg-brand-100 text-brand-700 mx-auto flex size-14 items-center justify-center rounded-full">
              <CarIcon />
            </div>
            <h2 className="mt-3 text-xl font-black text-slate-900">신청이 접수되었습니다</h2>
            <p className="mt-1 text-sm text-slate-600">
              관리자가 승인하면서 차량을 배정합니다. 처리 결과는 관리자에게 문의해 확인해 주세요.
            </p>
          </div>

          <dl className="mt-5 divide-y divide-slate-100">
            <InfoRow icon={<TagIcon />} term="행선지">
              {destination}
            </InfoRow>
            <InfoRow icon={<DocumentIcon />} term="신청 사유">
              {reason}
            </InfoRow>
            <InfoRow icon={<ClockIcon />} term="신청 시간">
              {formatDateTimeRange(requestStartAt, requestEndAt)}
            </InfoRow>
            <InfoRow icon={<TagIcon />} term="예약 상태">
              <span className="badge bg-amber-100 text-amber-800">승인 대기</span>
            </InfoRow>
          </dl>

          <Link
            href={`/employee/company-vehicle/trips/${createdTripId}`}
            className="btn btn-primary mt-5 w-full"
          >
            내 신청 조회하기
          </Link>
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

function InfoRow({
  icon,
  term,
  children,
}: {
  icon: React.ReactNode;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <span className="bg-surface-hover text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        {icon}
      </span>
      <dt className="text-ink-faint w-16 shrink-0 text-xs font-bold">{term}</dt>
      <dd className="text-ink min-w-0 flex-1 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function CarIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 16.5V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5h14v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M5 11h14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.5 3.5H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l6.5-6.5a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={8} cy={8} r={1.3} fill="currentColor" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={8.5} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
