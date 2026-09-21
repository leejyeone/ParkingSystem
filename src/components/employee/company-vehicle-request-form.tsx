'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { CompanyVehicleSlotPicker } from '@/components/employee/company-vehicle-slot-picker';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { utcToZonedInput } from '@/lib/datetime';

type Props = {
  employeeName: string;
  /** 서버가 계산한 최소 선택 가능 시각('yyyy-MM-ddTHH:mm', KST). */
  minDateTimeInput: string;
  /** 최소 사전 신청 시간(분 단위, 시스템 설정) — 안내 문구 표시용. */
  reservationMinLeadMinutes: number;
  /** 운행 신청 가능 시간대 시작 'HH:mm'(시스템 설정). */
  operatingStartTime: string;
  /** 운행 신청 가능 시간대 종료 'HH:mm'(시스템 설정). */
  operatingEndTime: string;
  /** 1회 최대 사용 가능 시간(시스템 설정, 시간 단위). */
  maxUsageHours: number;
};

type VehicleAvailability = {
  vehicleId: number;
  vehicleNo: string;
  vehicleModel: string | null;
  /** 그 차량이 이미 다른 신청(승인 대기 포함)에 걸려 있는 시간대(분 단위, 그날 0시 기준). */
  busyMinuteRanges: { start: number; end: number }[];
};

function toMinutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** UTC ISO 시각을 그날(date) 기준 0시부터의 분으로 변환한다(KST 기준). 다른 날짜면 null. */
function isoToMinutesOfDay(iso: string, date: string): number | null {
  const zoned = utcToZonedInput(new Date(iso)); // 'yyyy-MM-ddTHH:mm'
  const [datePart, timePart] = zoned.split('T');
  if (datePart !== date) return null;
  return toMinutesOfDay(timePart);
}

/** 예약 구간을 병합했을 때 운영시간 전체를 빈틈없이 덮는지(=하루 종일 꽉 찼는지). */
function isFullyBooked(
  busyMinuteRanges: { start: number; end: number }[],
  operatingStartMin: number,
  operatingEndMin: number,
): boolean {
  const sorted = [...busyMinuteRanges].sort((a, b) => a.start - b.start);
  let cursor = operatingStartMin;
  for (const range of sorted) {
    if (range.start > cursor) return false; // 빈틈 발견
    cursor = Math.max(cursor, range.end);
    if (cursor >= operatingEndMin) return true;
  }
  return cursor >= operatingEndMin;
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
  reservationMinLeadMinutes,
  operatingStartTime,
  operatingEndTime,
  maxUsageHours,
}: Props) {
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(minDateTimeInput.split('T')[0]);
  const [vehicles, setVehicles] = useState<VehicleAvailability[] | null>(null);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleFetchError, setVehicleFetchError] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [requestStartAt, setRequestStartAt] = useState('');
  const [requestEndAt, setRequestEndAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<number | null>(null);

  const operatingStartMin = toMinutesOfDay(operatingStartTime);
  const operatingEndMin = toMinutesOfDay(operatingEndTime);

  useEffect(() => {
    const timer = setTimeout(() => {
      // 운행일이 바뀌면 그 전에 고른 차량·시간은 무효가 되므로 비운다.
      setVehicleId(null);
      setRequestStartAt('');
      setRequestEndAt('');
      setVehicles(null);

      if (!date) return;

      setLoadingVehicles(true);
      setVehicleFetchError(null);

      apiRequest<{
        vehicles: {
          vehicleId: number;
          vehicleNo: string;
          vehicleModel: string | null;
          busyRanges: { start: string; end: string }[];
        }[];
      }>(`/api/company-vehicle-trips/vehicle-availability?date=${date}`).then((response) => {
        setLoadingVehicles(false);
        if (!response.ok) {
          setVehicleFetchError(response.error.message);
          return;
        }
        setVehicles(
          response.data.vehicles.map((vehicle) => ({
            vehicleId: vehicle.vehicleId,
            vehicleNo: vehicle.vehicleNo,
            vehicleModel: vehicle.vehicleModel,
            busyMinuteRanges: vehicle.busyRanges
              .map((range) => {
                const start = isoToMinutesOfDay(range.start, date);
                const end = isoToMinutesOfDay(range.end, date);
                if (start === null || end === null) return null;
                return { start, end };
              })
              .filter((range): range is { start: number; end: number } => range !== null),
          })),
        );
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [date]);

  const availableVehicles = (vehicles ?? []).filter(
    (vehicle) => !isFullyBooked(vehicle.busyMinuteRanges, operatingStartMin, operatingEndMin),
  );
  const selectedVehicle = availableVehicles.find((vehicle) => vehicle.vehicleId === vehicleId) ?? null;

  function handleVehicleChange(value: string) {
    const nextId = value ? Number(value) : null;
    setVehicleId(nextId);
    setRequestStartAt('');
    setRequestEndAt('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest<{ tripId: number; tripStatus: string }>(
      '/api/company-vehicle-trips',
      {
        method: 'POST',
        body: JSON.stringify({ destination, reason, requestStartAt, requestEndAt, vehicleId }),
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
              선택하신 차량으로 승인 처리됩니다. 처리 결과는 관리자에게 문의해 확인해 주세요.
            </p>
          </div>

          <dl className="mt-5 divide-y divide-slate-100">
            <InfoRow icon={<TagIcon />} term="선택 차량">
              {selectedVehicle?.vehicleNo ?? '-'}
            </InfoRow>
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

        <p className="field-hint">
          운행 시작 시간은 신청 시점 기준 최소 {reservationMinLeadMinutes}분 이후부터, 1회 최대{' '}
          {maxUsageHours}시간까지 선택할 수 있습니다.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="운행 예정일"
            htmlFor="company-vehicle-date"
            required
            errors={fieldErrors.requestStartAt}
          >
            <input
              id="company-vehicle-date"
              type="date"
              min={minDateTimeInput.split('T')[0]}
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>

          {date && (
            <FormField
              label="사용할 차량"
              htmlFor="company-vehicle-select"
              required
              errors={fieldErrors.vehicleId}
            >
              {loadingVehicles ? (
                <p className="text-ink-faint text-sm">차량 예약 현황을 불러오는 중…</p>
              ) : vehicleFetchError ? (
                <p className="text-sm font-bold text-red-600">{vehicleFetchError}</p>
              ) : availableVehicles.length === 0 ? (
                <Alert variant="warning">이 날짜에는 사용 가능한 차량이 없습니다.</Alert>
              ) : (
                <select
                  id="company-vehicle-select"
                  className={inputClassName(Boolean(fieldErrors.vehicleId))}
                  value={vehicleId ?? ''}
                  onChange={(event) => handleVehicleChange(event.target.value)}
                >
                  <option value="">차량을 선택해 주세요</option>
                  {availableVehicles.map((vehicle) => (
                    <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                      {vehicle.vehicleNo}
                      {vehicle.vehicleModel ? ` (${vehicle.vehicleModel})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
        </div>

        {selectedVehicle && (
          <FormField label="운행 가능 시간" htmlFor="company-vehicle-picker" required>
            <div id="company-vehicle-picker">
              <CompanyVehicleSlotPicker
                date={date}
                operatingStartTime={operatingStartTime}
                operatingEndTime={operatingEndTime}
                minDateTimeInput={minDateTimeInput}
                maxUsageHours={maxUsageHours}
                busyMinuteRanges={selectedVehicle.busyMinuteRanges}
                requestStartAt={requestStartAt}
                requestEndAt={requestEndAt}
                onChange={(value) => {
                  setRequestStartAt(value.requestStartAt);
                  setRequestEndAt(value.requestEndAt);
                }}
              />
            </div>
          </FormField>
        )}

        {requestStartAt && requestEndAt && (
          <Alert variant="success">{formatDateTimeRange(requestStartAt, requestEndAt)}, {selectedVehicle?.vehicleNo} 신청됩니다.</Alert>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={
            submitting ||
            !destination.trim() ||
            !reason.trim() ||
            !requestStartAt ||
            !requestEndAt ||
            vehicleId === null
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
