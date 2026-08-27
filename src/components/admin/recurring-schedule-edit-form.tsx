'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function maskToWeekdays(mask: number): boolean[] {
  return Array.from({ length: 7 }, (_, index) => ((mask >> index) & 1) === 1);
}

type UpdateResult = {
  cancelledCount: number;
  createdCount: number;
  skippedDates: string[];
};

export function RecurringScheduleEditForm({
  scheduleId,
  initial,
}: {
  scheduleId: number;
  initial: {
    startDate: string;
    endDate: string;
    weekdaysMask: number;
    dailyStartTime: string;
    dailyEndTime: string;
    approvalEnabled: boolean;
    emailEnabled: boolean;
  };
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [weekdays, setWeekdays] = useState<boolean[]>(maskToWeekdays(initial.weekdaysMask));
  const [dailyStartTime, setDailyStartTime] = useState(initial.dailyStartTime);
  const [dailyEndTime, setDailyEndTime] = useState(initial.dailyEndTime);
  const [approvalEnabled, setApprovalEnabled] = useState(initial.approvalEnabled);
  const [emailEnabled, setEmailEnabled] = useState(initial.emailEnabled);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);

  function toggleWeekday(index: number) {
    setWeekdays((previous) => previous.map((checked, i) => (i === index ? !checked : checked)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest<UpdateResult>(
      `/api/admin/recurring-reservations/${scheduleId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          startDate,
          endDate: endDate || null,
          weekdays,
          dailyStartTime,
          dailyEndTime,
          approvalEnabled,
          emailEnabled,
        }),
      },
    );

    setSubmitting(false);

    if (!response.ok) {
      setFieldErrors(response.error.fieldErrors ?? {});
      setFormError(response.error.message);
      return;
    }

    setResult(response.data);
  }

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      router.push(`/admin/recurring-reservations/${scheduleId}`);
    }, 1500);
    return () => clearTimeout(timer);
  }, [result, router, scheduleId]);

  if (result) {
    return (
      <div className="card">
        <div className="card-body space-y-4">
          <Alert variant="success" title="반복 일정이 수정되었습니다">
            <p>
              기존 예정 방문 {result.cancelledCount}건을 정리하고 새 일정으로 {result.createdCount}
              건을 생성했습니다.
            </p>
            {result.skippedDates.length > 0 && (
              <p className="mt-1">
                다음 {result.skippedDates.length}개 날짜는 해당 주차면이 이미 사용 중이라
                건너뛰었습니다: {result.skippedDates.join(', ')}
              </p>
            )}
            <p className="mt-1">잠시 후 상세 화면으로 이동합니다…</p>
          </Alert>
        </div>
      </div>
    );
  }

  const isFormValid = Boolean(
    startDate && weekdays.some(Boolean) && dailyStartTime && dailyEndTime,
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <div className="card">
          <div className="card-body">
            <Alert variant="error">{formError}</Alert>
          </div>
        </div>
      )}

      <section className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">반복 일정</h2>
          <p className="field-hint">
            대상 직원과 주차면은 바꿀 수 없습니다. 바꾸려면 이 반복 예약을 삭제하고 새로 등록해
            주세요.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="시작일"
              htmlFor="recurring-start"
              required
              errors={fieldErrors.startDate}
            >
              <input
                id="recurring-start"
                type="date"
                className={inputClassName(Boolean(fieldErrors.startDate))}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </FormField>
            <FormField
              label="종료일"
              htmlFor="recurring-end"
              hint="비워두면 종료일 없이 무기한으로 등록되며, 예약은 6개월씩 생성됩니다."
              errors={fieldErrors.endDate}
            >
              <input
                id="recurring-end"
                type="date"
                className={inputClassName(Boolean(fieldErrors.endDate))}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </FormField>
          </div>

          <FormField label="반복 요일" htmlFor="recurring-weekdays" errors={fieldErrors.weekdays}>
            <div id="recurring-weekdays" className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, index) => (
                <label
                  key={label}
                  className={`flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-bold ${
                    weekdays[index]
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={weekdays[index]}
                    onChange={() => toggleWeekday(index)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="매일 시작 시간"
              htmlFor="recurring-daily-start"
              required
              errors={fieldErrors.dailyStartTime}
            >
              <input
                id="recurring-daily-start"
                type="time"
                className={inputClassName(Boolean(fieldErrors.dailyStartTime))}
                value={dailyStartTime}
                onChange={(event) => setDailyStartTime(event.target.value)}
              />
            </FormField>
            <FormField
              label="매일 종료 시간"
              htmlFor="recurring-daily-end"
              required
              errors={fieldErrors.dailyEndTime}
            >
              <input
                id="recurring-daily-end"
                type="time"
                className={inputClassName(Boolean(fieldErrors.dailyEndTime))}
                value={dailyEndTime}
                onChange={(event) => setDailyEndTime(event.target.value)}
              />
            </FormField>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-body space-y-3">
          <h2 className="card-title">승인 · 메일 옵션</h2>

          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={approvalEnabled}
              onChange={(event) => setApprovalEnabled(event.target.checked)}
            />
            <span className="text-sm font-semibold text-slate-800">
              관리자 승인 사용 (해제하면 바로 자동 승인됩니다)
            </span>
          </label>

          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={emailEnabled}
              onChange={(event) => setEmailEnabled(event.target.checked)}
            />
            <span className="text-sm font-semibold text-slate-800">
              개별 예약 알림 메일 발송 (해제해도 시리즈 수정/제외/삭제 안내는 항상 발송됩니다)
            </span>
          </label>
        </div>
      </section>

      <div className="sticky-actions">
        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={submitting || !isFormValid}
        >
          {submitting ? '저장 중…' : '변경 사항 저장'}
        </button>
      </div>
    </form>
  );
}
