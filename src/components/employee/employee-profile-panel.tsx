'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { formatPhoneInput } from '@/lib/phone';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Profile = {
  /** 사번이 확정되지 않은 직원이 있어 비어 있을 수 있다. */
  employeeCode: string | null;
  email: string;
  name: string;
  departmentName: string;
  vehicleNo: string | null;
  companyOrBranchName: string | null;
  /** 없으면 이 화면 외 다른 직원 화면을 열 수 없다(requireEmployeePage 가 강제). */
  phone: string | null;
};

/**
 * 직원 내 정보 패널.
 *
 * 이름/이메일/부서/사번은 명부(그룹웨어/시드 스크립트)로만 갱신되므로 읽기 전용으로
 * 보여주고, 직원이 직접 바꿀 수 있는 건 차량번호·소속 사업장명·전화번호(전부 명부에 없거나
 * 그룹웨어 실시간 동기화가 채워주지 않는 값이라 본인이 채워야 한다)다. 전화번호는 방문객이
 * 이 직원을 "당사 담당자"로 등록할 때 검증하는 값이라 필수다.
 */
export function EmployeeProfilePanel({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [vehicleNo, setVehicleNo] = useState(profile.vehicleNo ?? '');
  const [companyOrBranchName, setCompanyOrBranchName] = useState(profile.companyOrBranchName ?? '');
  const [phone, setPhone] = useState(formatPhoneInput(profile.phone ?? ''));
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
      body: JSON.stringify({ vehicleNo, companyOrBranchName, phone }),
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
            차량번호·소속 사업장명은 본인 방문 신청 시 자동으로 입력됩니다.
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
          label="소속 사업장명"
          htmlFor="employee-profile-company"
          hint="비워 두면 본인 방문 신청 시 직접 입력합니다."
          errors={fieldErrors.companyOrBranchName}
        >
          <input
            id="employee-profile-company"
            className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
            value={companyOrBranchName}
            onChange={(event) => setCompanyOrBranchName(event.target.value)}
            placeholder="동탄"
            maxLength={100}
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

        <FormField
          label="전화번호"
          htmlFor="employee-profile-phone"
          required
          hint="방문객이 담당자를 등록할 때 이름과 함께 확인하는 값입니다."
          errors={fieldErrors.phone}
        >
          <input
            id="employee-profile-phone"
            className={inputClassName(Boolean(fieldErrors.phone))}
            inputMode="numeric"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="010-1234-5678"
            maxLength={13}
          />
        </FormField>

        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? '저장 중…' : '내 정보 저장'}
        </button>
      </div>
    </form>
  );
}
