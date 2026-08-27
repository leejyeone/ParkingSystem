'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Profile = {
  employeeCode: string;
  email: string;
  name: string;
  departmentName: string;
  vehicleNo: string | null;
};

/**
 * 직원 내 정보 패널.
 *
 * 이름/이메일/부서/사번은 명부(그룹웨어/시드 스크립트)로만 갱신되므로 읽기 전용으로
 * 보여주고, 직원이 직접 바꿀 수 있는 건 차량번호(방문 신청 폼 자동완성용)뿐이다.
 */
export function EmployeeProfilePanel({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [vehicleNo, setVehicleNo] = useState(profile.vehicleNo ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    setVehicleNo(normalizeVehicleNo(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest('/api/employee/profile', {
      method: 'PUT',
      body: JSON.stringify({ vehicleNo }),
    });

    setSubmitting(false);

    if (response.ok) {
      setMessage({ variant: 'success', text: '내 정보를 저장했습니다.' });
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card">
      <div className="card-body space-y-5">
        <div>
          <h2 className="card-title">내 정보</h2>
          <p className="field-hint">
            이름·이메일·부서는 사내 명부 기준으로 표시되며 여기서 바꿀 수 없습니다. 차량번호는 방문
            신청 시 자동으로 입력됩니다.
          </p>
        </div>

        {message && (
          <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
            {message.text}
          </Alert>
        )}

        <FormField label="이름" htmlFor="employee-profile-name">
          <input
            id="employee-profile-name"
            className="input"
            value={profile.name}
            disabled
            readOnly
          />
        </FormField>

        <FormField label="부서" htmlFor="employee-profile-department">
          <input
            id="employee-profile-department"
            className="input"
            value={profile.departmentName}
            disabled
            readOnly
          />
        </FormField>

        <FormField label="이메일" htmlFor="employee-profile-email">
          <input
            id="employee-profile-email"
            className="input"
            value={profile.email}
            disabled
            readOnly
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="employee-profile-vehicle"
          hint="비워 두면 신청 시 직접 입력합니다."
          errors={fieldErrors.vehicleNo}
        >
          <input
            id="employee-profile-vehicle"
            className={inputClassName(Boolean(fieldErrors.vehicleNo))}
            value={vehicleNo}
            onChange={handleVehicleNoChange}
            placeholder="12가3456"
            maxLength={20}
          />
        </FormField>

        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? '저장 중…' : '내 정보 저장'}
        </button>
      </div>
    </form>
  );
}
