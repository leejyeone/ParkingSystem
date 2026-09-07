'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Profile = {
  email: string;
  name: string;
  companyOrBranchName: string;
  vehicleNo: string | null;
};

/**
 * 내 정보 수정 패널.
 * 여기 저장된 값만 방문 신청 폼 자동완성에 사용된다.
 * (신청 폼에서 값을 고쳐도 회원 정보는 바뀌지 않는다)
 */
export function UserProfilePanel({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name,
    companyOrBranchName: profile.companyOrBranchName,
    vehicleNo: profile.vehicleNo ?? '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    update('vehicleNo', normalizeVehicleNo(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    const response = await apiRequest('/api/my/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: form.name,
        companyOrBranchName: form.companyOrBranchName,
        vehicleNo: form.vehicleNo,
        // 비워 두면 비밀번호는 변경하지 않는다.
        ...(form.password ? { password: form.password } : {}),
      }),
    });

    setSubmitting(false);

    if (response.ok) {
      setForm((previous) => ({ ...previous, password: '' }));
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
          <p className="field-hint">방문 신청 시 아래 정보가 자동으로 입력됩니다.</p>
        </div>

        {message && (
          <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
            {message.text}
          </Alert>
        )}

        <FormField label="이메일" htmlFor="profile-email" hint="이메일은 변경할 수 없습니다.">
          <input id="profile-email" className="input" value={profile.email} disabled readOnly />
        </FormField>

        <FormField label="성명" htmlFor="profile-name" required errors={fieldErrors.name}>
          <input
            id="profile-name"
            className={inputClassName(Boolean(fieldErrors.name))}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            maxLength={50}
          />
        </FormField>

        <FormField
          label="방문 상호 또는 소속 사업장명"
          htmlFor="profile-company"
          required
          errors={fieldErrors.companyOrBranchName}
        >
          <input
            id="profile-company"
            className={inputClassName(Boolean(fieldErrors.companyOrBranchName))}
            value={form.companyOrBranchName}
            onChange={(event) => update('companyOrBranchName', event.target.value)}
            maxLength={100}
          />
        </FormField>

        <FormField
          label="차량번호"
          htmlFor="profile-vehicle"
          hint="비워 두면 신청 시 직접 입력합니다."
          errors={fieldErrors.vehicleNo}
        >
          <input
            id="profile-vehicle"
            className={inputClassName(Boolean(fieldErrors.vehicleNo))}
            value={form.vehicleNo}
            onChange={handleVehicleNoChange}
            placeholder="12가3456"
            maxLength={20}
          />
        </FormField>

        <FormField
          label="새 비밀번호"
          htmlFor="profile-password"
          hint="변경할 때만 입력하세요. 8자 이상"
          errors={fieldErrors.password}
        >
          <PasswordInput
            id="profile-password"
            className={inputClassName(Boolean(fieldErrors.password))}
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            autoComplete="new-password"
            maxLength={100}
          />
        </FormField>

        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? '저장 중…' : '내 정보 저장'}
        </button>
      </div>
    </form>
  );
}
