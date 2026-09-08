'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  EmployeeSearchSelect,
  type SelectedEmployee,
} from '@/components/reservation/employee-search-select';
import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

type SpaceOption = { spaceId: number; spaceCode: string; areaName: string };

type EmployeeProfile = {
  employeeUserId: number;
  name: string;
  email: string;
  departmentName: string;
  vehicleNo: string | null;
};

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
/** 평일(월~금)만 기본으로 켜 둔다 — 가장 흔한 사용 패턴이다. */
const DEFAULT_WEEKDAYS = [false, true, true, true, true, true, false];

/** 반복 예약 최대 기한(1개월 = 31일). 종료일 입력의 `max` 속성을 계산하는 데 쓴다. */
const MAX_SCHEDULE_DAYS = 31;

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type CreateResult = {
  scheduleId: number;
  createdCount: number;
  skippedDates: string[];
};

export function RecurringScheduleForm({
  spaces,
  entryExitManagementEnabled,
}: {
  spaces: SpaceOption[];
  entryExitManagementEnabled: boolean;
}) {
  const router = useRouter();
  const [employee, setEmployee] = useState<SelectedEmployee | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [vehicleNo, setVehicleNo] = useState('');
  const [spaceId, setSpaceId] = useState<number | ''>(spaces[0]?.spaceId ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weekdays, setWeekdays] = useState<boolean[]>(DEFAULT_WEEKDAYS);
  const [dailyStartTime, setDailyStartTime] = useState('09:00');
  const [dailyEndTime, setDailyEndTime] = useState('18:00');
  // 관리자가 이미 확인하고 등록하는 흐름이라 기본은 "승인 생략"(자동 승인) — 체크를
  // 해제해야 일반 방문 신청처럼 승인 대기 상태로 만들어진다.
  const [skipApproval, setSkipApproval] = useState(true);
  const [autoEntryExitEnabled, setAutoEntryExitEnabled] = useState(true);
  const [hiddenFromReservationList, setHiddenFromReservationList] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  useEffect(() => {
    if (!employee) return;

    let cancelled = false;

    async function loadProfile(employeeUserId: number) {
      setProfileLoading(true);
      setProfileError(null);

      const response = await apiRequest<EmployeeProfile>(`/api/admin/employees/${employeeUserId}`);
      if (cancelled) return;

      setProfileLoading(false);
      if (!response.ok) {
        setProfile(null);
        setVehicleNo('');
        setProfileError(response.error.message);
        return;
      }
      setProfile(response.data);
      setVehicleNo(response.data.vehicleNo ?? '');
    }

    loadProfile(employee.employeeUserId);

    return () => {
      cancelled = true;
    };
  }, [employee]);

  function handleEmployeeChange(next: SelectedEmployee | null) {
    setEmployee(next);
    if (next) {
      setFieldErrors((previous) => {
        if (!previous.employeeUserId) return previous;
        const rest = { ...previous };
        delete rest.employeeUserId;
        return rest;
      });
    } else {
      setProfile(null);
      setProfileError(null);
      setVehicleNo('');
    }
  }

  function toggleWeekday(index: number) {
    setWeekdays((previous) => previous.map((checked, i) => (i === index ? !checked : checked)));
  }

  /**
   * 버튼을 비활성화하는 대신, 제출 시점에 빈 필수 필드를 찾아 fieldErrors 를 채운다.
   * 특히 "대상 직원"은 검색창에 이름만 입력하고 목록에서 선택하지 않으면 값이 null로
   * 남는데, 이걸 놓치면 저장이 조용히 막히기만 하고 아무 안내도 없었다 — 빨간 테두리 +
   * 안내 문구로 바로 보여주기 위함.
   */
  function findRequiredFieldErrors(): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    if (!employee) {
      errors.employeeUserId = ['대상 직원을 선택해 주세요.'];
    }
    if (employee && !vehicleNo.trim()) {
      errors.vehicleNo = ['차량번호를 입력해 주세요.'];
    }
    if (!spaceId) {
      errors.spaceId = ['주차면을 선택해 주세요.'];
    }
    if (!startDate) {
      errors.startDate = ['시작일을 입력해 주세요.'];
    }
    if (!endDate) {
      errors.endDate = ['종료일을 입력해 주세요.'];
    }
    if (!weekdays.some(Boolean)) {
      errors.weekdays = ['반복 요일을 하나 이상 선택해 주세요.'];
    }
    if (!dailyStartTime) {
      errors.dailyStartTime = ['매일 시작 시간을 입력해 주세요.'];
    }
    if (!dailyEndTime) {
      errors.dailyEndTime = ['매일 종료 시간을 입력해 주세요.'];
    }

    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const clientErrors = findRequiredFieldErrors();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormError('입력하지 않은 항목이 있습니다. 빨간색으로 표시된 항목을 확인해 주세요.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const response = await apiRequest<CreateResult>('/api/admin/recurring-reservations', {
      method: 'POST',
      body: JSON.stringify({
        employeeUserId: employee?.employeeUserId,
        spaceId: spaceId || undefined,
        requesterName: profile?.name,
        requesterEmail: profile?.email,
        companyOrBranchName: null,
        vehicleNo,
        startDate,
        endDate,
        weekdays,
        dailyStartTime,
        dailyEndTime,
        approvalEnabled: !skipApproval,
        autoEntryExitEnabled: entryExitManagementEnabled ? autoEntryExitEnabled : false,
        hiddenFromReservationList,
      }),
    });

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
      router.push('/admin/recurring-reservations');
    }, 1500);
    return () => clearTimeout(timer);
  }, [result, router]);

  if (result) {
    return (
      <div className="card">
        <div className="card-body space-y-4">
          <Alert variant="success" title="반복 예약이 등록되었습니다">
            <p>총 {result.createdCount}건이 생성되었습니다.</p>
            {result.skippedDates.length > 0 && (
              <p className="mt-1">
                다음 {result.skippedDates.length}개 날짜는 해당 주차면이 이미 사용 중이라
                건너뛰었습니다: {result.skippedDates.join(', ')}
              </p>
            )}
            <p className="mt-1">잠시 후 목록으로 이동합니다…</p>
          </Alert>
        </div>
      </div>
    );
  }

  const vehicleNoKnown = Boolean(profile?.vehicleNo);
  // 직원을 선택했는데 아직 프로필을 불러오는 중(또는 실패)이면, requesterName/email 이
  // 비어 있는 채로 제출될 수 있으니 그 사이에만 버튼을 막는다. 그 외 필수 항목 미입력은
  // 버튼을 막지 않고 제출 시 findRequiredFieldErrors 가 빨간 테두리로 안내한다.
  const profileNotReady = Boolean(employee) && (profileLoading || !profile);

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
          <h2 className="card-title">신청자 정보</h2>

          <FormField
            label="대상 직원"
            htmlFor="recurring-employee"
            required
            errors={fieldErrors.employeeUserId}
          >
            <EmployeeSearchSelect
              id="recurring-employee"
              value={employee}
              onChange={handleEmployeeChange}
              hasError={Boolean(fieldErrors.employeeUserId)}
            />
          </FormField>

          {profileError && <Alert variant="error">{profileError}</Alert>}

          {employee && (
            <>
              <FormField label="성명" htmlFor="recurring-name">
                <input
                  id="recurring-name"
                  className={inputClassName(false)}
                  value={profileLoading ? '불러오는 중…' : (profile?.name ?? '')}
                  disabled
                  readOnly
                />
              </FormField>

              <FormField label="이메일" htmlFor="recurring-email">
                <input
                  id="recurring-email"
                  className={inputClassName(false)}
                  value={profileLoading ? '불러오는 중…' : (profile?.email ?? '')}
                  disabled
                  readOnly
                />
              </FormField>

              <FormField
                label="차량번호"
                htmlFor="recurring-vehicle"
                required
                hint={
                  vehicleNoKnown ? undefined : '직원 정보에 등록된 차량번호가 없어 직접 입력합니다.'
                }
                errors={fieldErrors.vehicleNo}
              >
                <input
                  id="recurring-vehicle"
                  className={inputClassName(Boolean(fieldErrors.vehicleNo))}
                  value={vehicleNo}
                  onChange={(event) => setVehicleNo(normalizeVehicleNo(event.target.value))}
                  placeholder="12가3456"
                  maxLength={20}
                  disabled={vehicleNoKnown}
                  readOnly={vehicleNoKnown}
                />
              </FormField>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-body space-y-4">
          <h2 className="card-title">반복 일정</h2>

          <FormField label="주차면" htmlFor="recurring-space" required errors={fieldErrors.spaceId}>
            <select
              id="recurring-space"
              className={inputClassName(Boolean(fieldErrors.spaceId))}
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value ? Number(event.target.value) : '')}
            >
              {spaces.map((space) => (
                <option key={space.spaceId} value={space.spaceId}>
                  {space.areaName} - {space.spaceCode}
                </option>
              ))}
            </select>
          </FormField>

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
                max={startDate ? addDays(startDate, MAX_SCHEDULE_DAYS - 1) : undefined}
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
          disabled={submitting || profileNotReady}
        >
          {submitting ? '등록 중…' : '반복 예약 등록'}
        </button>
      </div>
    </form>
  );
}
