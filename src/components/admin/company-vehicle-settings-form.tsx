'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import type { SystemSettingsValues } from '@/domain/system-settings';
import { apiRequest } from '@/lib/client/api-client';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

/**
 * 법인차량 운행 정책 설정(운영 시간대/최대 사용시간)만 다루는 폼.
 *
 * `/api/admin/settings` PUT 은 시스템 설정 전체를 하나의 객체로 받으므로, 이 폼은 서버에서
 * 받은 전체 설정값(`initialSettings`)을 그대로 들고 있다가 이 화면이 다루는 필드만 바꿔서
 * 통째로 PUT 한다 — 방문 예약 관련 값(`src/components/admin/settings-panel.tsx`의
 * `PolicySection`이 다루는 값)은 건드리지 않고 그대로 보존한다.
 */
export function CompanyVehicleSettingsForm({
  initialSettings,
}: {
  initialSettings: SystemSettingsValues;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useDismissOnInteraction(Boolean(message), () => setMessage(null));

  async function handleSave() {
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings: form }),
    });

    setPending(false);
    if (response.ok) {
      setMessage({ variant: 'success', text: '설정을 저장했습니다.' });
      router.refresh();
      return;
    }
    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  return (
    <section className="card">
      <div className="card-body space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">운행 정책</h2>
          <button
            type="button"
            className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={handleSave}
          >
            {pending ? '저장 중…' : '설정 저장'}
          </button>
        </div>
        {message && (
          <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
            {message.text}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="운행 신청 가능 시작 시간"
            htmlFor="companyVehicleOperatingStartTime"
            required
            hint="방문 예약 운영시간과 별개로 관리됩니다."
            errors={fieldErrors.companyVehicleOperatingStartTime}
          >
            <input
              id="companyVehicleOperatingStartTime"
              type="time"
              className={inputClassName(Boolean(fieldErrors.companyVehicleOperatingStartTime))}
              value={form.companyVehicleOperatingStartTime}
              onChange={(event) =>
                setForm({ ...form, companyVehicleOperatingStartTime: event.target.value })
              }
            />
          </FormField>
          <FormField
            label="운행 신청 가능 종료 시간"
            htmlFor="companyVehicleOperatingEndTime"
            required
            errors={fieldErrors.companyVehicleOperatingEndTime}
          >
            <input
              id="companyVehicleOperatingEndTime"
              type="time"
              className={inputClassName(Boolean(fieldErrors.companyVehicleOperatingEndTime))}
              value={form.companyVehicleOperatingEndTime}
              onChange={(event) =>
                setForm({ ...form, companyVehicleOperatingEndTime: event.target.value })
              }
            />
          </FormField>
          <FormField
            label="1회 최대 사용 가능 시간(시간)"
            htmlFor="companyVehicleMaxUsageHours"
            required
            errors={fieldErrors.companyVehicleMaxUsageHours}
          >
            <input
              id="companyVehicleMaxUsageHours"
              type="number"
              min={1}
              max={12}
              className={inputClassName(Boolean(fieldErrors.companyVehicleMaxUsageHours))}
              value={form.companyVehicleMaxUsageHours}
              onChange={(event) =>
                setForm({ ...form, companyVehicleMaxUsageHours: Number(event.target.value) })
              }
            />
          </FormField>
        </div>
      </div>
    </section>
  );
}
