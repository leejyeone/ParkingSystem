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

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type UpdateResult = {
  cancelledCount: number;
  updatedCount: number;
  createdCount: number;
  skippedDates: string[];
};

export function RecurringScheduleEditForm({
  scheduleId,
  initial,
  entryExitManagementEnabled,
}: {
  scheduleId: number;
  initial: {
    startDate: string;
    endDate: string;
    weekdaysMask: number;
    dailyStartTime: string;
    dailyEndTime: string;
    approvalEnabled: boolean;
    autoEntryExitEnabled: boolean;
    hiddenFromReservationList: boolean;
  };
  entryExitManagementEnabled: boolean;
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [weekdays, setWeekdays] = useState<boolean[]>(maskToWeekdays(initial.weekdaysMask));
  const [dailyStartTime, setDailyStartTime] = useState(initial.dailyStartTime);
  const [dailyEndTime, setDailyEndTime] = useState(initial.dailyEndTime);
  // "관리자 승인 생략" 체크박스 — 실제 저장 필드(approvalEnabled)의 반대 의미다.
  const [skipApproval, setSkipApproval] = useState(!initial.approvalEnabled);
  const [autoEntryExitEnabled, setAutoEntryExitEnabled] = useState(initial.autoEntryExitEnabled);
  const [hiddenFromReservationList, setHiddenFromReservationList] = useState(
    initial.hiddenFromReservationList,
  );

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
          endDate,
          weekdays,
          dailyStartTime,
          dailyEndTime,
          approvalEnabled: !skipApproval,
          autoEntryExitEnabled: entryExitManagementEnabled ? autoEntryExitEnabled : false,
          hiddenFromReservationList,
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
              기존 예정 방문 중 {result.updatedCount}건은 시간만 갱신하고, {result.cancelledCount}
              건은 취소했습니다. 새 일정으로 {result.createdCount}건을 생성했습니다.
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
    startDate && endDate && weekdays.some(Boolean) && dailyStartTime && dailyEndTime,
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
              required
              hint="시작일로부터 최대 1개월(31일) 이내로 입력해 주세요."
              errors={fieldErrors.endDate}
            >
              <input
                id="recurring-end"
                type="date"
                className={inputClassName(Boolean(fieldErrors.endDate))}
                value={endDate}
                min={startDate || undefined}
                max={startDate ? addDays(startDate, 30) : undefined}
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
                      : 'border-line bg-surface text-ink-muted'
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
          <h2 className="card-title">승인 옵션</h2>
          <p className="text-ink-faint text-xs">
            반복 예약은 등록/승인/변경/취소 등 어떤 경우에도 메일이 발송되지 않습니다.
          </p>

          <label className="border-line flex min-h-11 items-center gap-3 rounded-lg border px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={skipApproval}
              onChange={(event) => setSkipApproval(event.target.checked)}
            />
            <span className="text-ink text-sm font-semibold">관리자 승인 생략</span>
          </label>

          <label
            className={`border-line flex min-h-11 items-center gap-3 rounded-lg border px-3 ${
              entryExitManagementEnabled ? '' : 'opacity-50'
            }`}
          >
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={autoEntryExitEnabled}
              disabled={!entryExitManagementEnabled}
              onChange={(event) => setAutoEntryExitEnabled(event.target.checked)}
            />
            <span className="text-ink text-sm font-semibold">
              입출차 자동 처리
              {!entryExitManagementEnabled && ' — 입·출차 관리가 꺼져 있어 사용할 수 없습니다'}
            </span>
          </label>

          <label className="border-line flex min-h-11 items-center gap-3 rounded-lg border px-3">
            <input
              type="checkbox"
              className="accent-brand-700 size-5"
              checked={hiddenFromReservationList}
              onChange={(event) => setHiddenFromReservationList(event.target.checked)}
            />
            <span className="text-ink text-sm font-semibold">전체 예약 목록에서 숨기기</span>
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
