'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { apiRequest } from '@/lib/client/api-client';
import { formatPhoneInput } from '@/lib/phone';
import { normalizeVehicleNo } from '@/lib/vehicle';

type Profile = {
  email: string;
  name: string;
  companyOrBranchName: string;
  vehicleNo: string | null;
  hostEmployeeName: string | null;
  hostEmployeeDepartmentName: string | null;
};

type VerifiedHostEmployee = { employeeUserId: number; name: string; departmentName: string };

function buildForm(profile: Profile) {
  return {
    name: profile.name,
    companyOrBranchName: profile.companyOrBranchName,
    vehicleNo: profile.vehicleNo ?? '',
    password: '',
  };
}

/**
 * 내 정보 카드. 기본은 보기 전용이고, 우상단 연필을 눌러야 수정 모드로 바뀐다
 * (그 자리가 [취소]/[저장]으로 바뀐다). 여기 저장된 값(담당자 포함)만 방문 신청 폼에
 * 그대로 쓰인다 — 신청 시점엔 전부 읽기 전용이라 여기서 고쳐야만 다음 신청에 반영된다.
 */
export function UserProfilePanel({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => buildForm(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const [currentHostEmployee, setCurrentHostEmployee] = useState({
    name: profile.hostEmployeeName,
    departmentName: profile.hostEmployeeDepartmentName,
  });

  // 담당자 변경 — 수정 모드 안에서만 나타나는 하위 흐름. 이름+전화 재확인 후, 메인
  // [저장]을 누를 때 함께 반영된다(확인 자체는 즉시 반영이 아니다).
  const [hostEmployeeSearching, setHostEmployeeSearching] = useState(false);
  const [hostEmployeeForm, setHostEmployeeForm] = useState({ name: '', phone: '' });
  const [hostEmployeeVerifying, setHostEmployeeVerifying] = useState(false);
  const [hostEmployeeError, setHostEmployeeError] = useState<string | null>(null);
  const [hostEmployeeVerified, setHostEmployeeVerified] = useState<VerifiedHostEmployee | null>(
    null,
  );

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleVehicleNoChange(event: ChangeEvent<HTMLInputElement>) {
    update('vehicleNo', normalizeVehicleNo(event.target.value));
  }

  function enterEdit() {
    setForm(buildForm(profile));
    setFieldErrors({});
    setMessage(null);
    setHostEmployeeSearching(false);
    setHostEmployeeVerified(null);
    setHostEmployeeError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setHostEmployeeSearching(false);
    setHostEmployeeVerified(null);
    setHostEmployeeError(null);
  }

  function openHostEmployeeSearch() {
    setHostEmployeeSearching(true);
    setHostEmployeeForm({ name: '', phone: '' });
    setHostEmployeeVerified(null);
    setHostEmployeeError(null);
  }

  function cancelHostEmployeeSearch() {
    setHostEmployeeSearching(false);
    setHostEmployeeVerified(null);
    setHostEmployeeError(null);
  }

  function updateHostEmployeeForm(key: keyof typeof hostEmployeeForm, value: string) {
    setHostEmployeeForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleVerifyHostEmployee() {
    setHostEmployeeVerifying(true);
    setHostEmployeeError(null);

    const response = await apiRequest<VerifiedHostEmployee>('/api/employees/verify-host', {
      method: 'POST',
      body: JSON.stringify(hostEmployeeForm),
    });

    setHostEmployeeVerifying(false);
    if (response.ok) {
      setHostEmployeeVerified(response.data);
      return;
    }
    setHostEmployeeError(response.error.message);
  }

  async function handleSave() {
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});

    if (hostEmployeeVerified) {
      const hostResponse = await apiRequest('/api/my/host-employee', {
        method: 'PUT',
        body: JSON.stringify(hostEmployeeForm),
      });
      if (!hostResponse.ok) {
        setSubmitting(false);
        setHostEmployeeError(hostResponse.error.message);
        return;
      }
    }

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
      if (hostEmployeeVerified) {
        setCurrentHostEmployee({
          name: hostEmployeeVerified.name,
          departmentName: hostEmployeeVerified.departmentName,
        });
      }
      setEditing(false);
      setHostEmployeeSearching(false);
      setHostEmployeeVerified(null);
      setMessage({ variant: 'success', text: '내 정보를 저장했습니다.' });
      router.refresh();
      return;
    }

    setFieldErrors(response.error.fieldErrors ?? {});
    setMessage({ variant: 'error', text: response.error.message });
  }

  const hostEmployeeBoxLabel = hostEmployeeVerified
    ? `${hostEmployeeVerified.name} (${hostEmployeeVerified.departmentName})`
    : currentHostEmployee.name
      ? `${currentHostEmployee.name} (${currentHostEmployee.departmentName})`
      : '등록된 담당자가 없습니다';

  return (
    <div className="card">
      <div className="card-body space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="card-title">내 정보</h2>
            <p className="field-hint">방문 신청 시 아래 정보가 자동으로 입력됩니다.</p>
          </div>
          {editing ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
                disabled={submitting}
                onClick={handleSave}
              >
                {submitting ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
                disabled={submitting}
                onClick={cancelEdit}
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-ink-muted hover:text-ink hover:bg-surface-hover shrink-0 rounded-lg p-2 transition"
              aria-label="내 정보 수정"
              onClick={enterEdit}
            >
              <PencilIcon />
            </button>
          )}
        </div>

        {message && (
          <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
            {message.text}
          </Alert>
        )}

        {!editing ? (
          <dl>
            <Row term="이메일" desc={profile.email} />
            <Row term="성명" desc={profile.name} />
            <Row term="회사명" desc={profile.companyOrBranchName} />
            <Row term="차량번호" desc={profile.vehicleNo ?? '-'} />
            <Row term="담당자" desc={hostEmployeeBoxLabel} />
          </dl>
        ) : (
          <div className="space-y-5">
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
              label="회사명"
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
              required
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

            <div>
              <p className="label label-required">담당자</p>
              {hostEmployeeSearching ? (
                <div className="space-y-2">
                  {hostEmployeeError && <Alert variant="error">{hostEmployeeError}</Alert>}
                  {hostEmployeeVerified ? (
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputClassName(false)} flex-1`}
                        value={`${hostEmployeeVerified.name} (${hostEmployeeVerified.departmentName})`}
                        readOnly
                      />
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0 px-2 py-1 text-xs"
                        onClick={cancelHostEmployeeSearch}
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className={`${inputClassName(false)} flex-1`}
                        placeholder="담당자 이름"
                        value={hostEmployeeForm.name}
                        onChange={(event) => updateHostEmployeeForm('name', event.target.value)}
                        maxLength={50}
                      />
                      <input
                        className={`${inputClassName(false)} flex-1`}
                        placeholder="담당자 전화번호"
                        inputMode="numeric"
                        value={hostEmployeeForm.phone}
                        onChange={(event) =>
                          updateHostEmployeeForm('phone', formatPhoneInput(event.target.value))
                        }
                        maxLength={13}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0 px-3 text-xs"
                        disabled={
                          hostEmployeeVerifying ||
                          !hostEmployeeForm.name.trim() ||
                          !hostEmployeeForm.phone.trim()
                        }
                        onClick={handleVerifyHostEmployee}
                      >
                        {hostEmployeeVerifying ? '검색 중…' : '검색'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary shrink-0 px-2 py-1 text-xs"
                        onClick={cancelHostEmployeeSearch}
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputClassName(false)} flex-1`}
                    value={
                      currentHostEmployee.name
                        ? `${currentHostEmployee.name} (${currentHostEmployee.departmentName})`
                        : '등록된 담당자가 없습니다'
                    }
                    readOnly
                  />
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0 px-2 py-1 text-xs"
                    onClick={openHostEmployeeSearch}
                  >
                    담당자 변경
                  </button>
                </div>
              )}
            </div>

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
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="definition-row">
      <dt className="definition-term">{term}</dt>
      <dd className="definition-desc">{desc}</dd>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.379-8.379-2.828-2.828Z" />
    </svg>
  );
}
