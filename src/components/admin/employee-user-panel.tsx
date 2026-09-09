'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { FormField, inputClassName } from '@/components/ui/form-field';
import { apiRequest } from '@/lib/client/api-client';
import { formatKstDateTime } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';

type EmployeeUser = {
  employeeUserId: number;
  name: string;
  departmentName: string;
  email: string;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  lastLoginAt: string | null;
  createdAt: string;
};

type BulkStatusResult = {
  succeeded: number[];
  failed: { employeeUserId: number; message: string }[];
};

/**
 * 서버 스키마(`EMPLOYEE_BULK_STATUS_MAX`, src/lib/validation/employee-schema.ts)의
 * 한 요청당 최대 처리 건수와 같은 값. "전체 선택" 시 이 단위로 나눠 순차 전송한다 —
 * 직원 수(현재 796명)가 이 값보다 많아도 항상 동작하게 하기 위함이다.
 */
const BULK_STATUS_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const ACCOUNT_STATUS_LABEL = { ACTIVE: '활성', INACTIVE: '비활성', LOCKED: '잠금' } as const;

const ACCOUNT_STATUS_CLASS = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  LOCKED: 'bg-orange-100 text-orange-800',
  INACTIVE: 'bg-surface-active text-ink-muted',
} as const;

/** 활성 여부를 보여주고 바로 전환하는 작은 스위치. */
function ActiveSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-emerald-600' : 'bg-line'
      }`}
    >
      <span
        className={`bg-surface inline-block size-3.5 transform rounded-full transition ${
          checked ? 'translate-x-[18px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

const EMPTY_ADD_FORM = {
  employeeCode: '',
  name: '',
  email: '',
  departmentName: '',
  vehicleNo: '',
  companyOrBranchName: '',
};

/**
 * 직원 계정 목록.
 *
 * 평소에는 계정별 스위치로 바로 활성·비활성을 전환한다. [선택]을 누르면 선택 모드로
 * 바뀌어 여러 행을 체크박스로 골라 한 번에 활성화/비활성화할 수 있다. [직원 추가]를
 * 누르면 명부 시드 스크립트 없이도 관리자가 그 자리에서 바로 계정을 만들 수 있다.
 */
export function EmployeeUserPanel({ employeeUsers }: { employeeUsers: EmployeeUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // 직원 계정은 비밀번호가 없어 브루트포스 잠금(LOCKED) 자체가 생기지 않으므로 필터 대상에 두지 않는다.
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkStatusResult | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addFieldErrors, setAddFieldErrors] = useState<Record<string, string[]>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  useDismissOnInteraction(Boolean(message || bulkResult || bulkError), () => {
    setMessage(null);
    setBulkResult(null);
    setBulkError(null);
  });

  const statusCounts = {
    ALL: employeeUsers.length,
    ACTIVE: employeeUsers.filter((user) => user.accountStatus === 'ACTIVE').length,
    INACTIVE: employeeUsers.filter((user) => user.accountStatus === 'INACTIVE').length,
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = employeeUsers
    .filter((user) => statusFilter === 'ALL' || user.accountStatus === statusFilter)
    .filter(
      (user) =>
        !normalizedQuery ||
        [user.name, user.departmentName, user.email].some((field) =>
          field.toLowerCase().includes(normalizedQuery),
        ),
    );

  const filteredIds = filteredUsers.map((user) => user.employeeUserId);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function startBulkMode() {
    setBulkMode(true);
    setSelected(new Set());
    setBulkError(null);
    setBulkResult(null);
  }

  function cancelBulkMode() {
    setBulkMode(false);
    setSelected(new Set());
    setBulkError(null);
  }

  function toggleSelected(employeeUserId: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(employeeUserId)) next.delete(employeeUserId);
      else next.add(employeeUserId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allFilteredSelected ? new Set() : new Set(filteredIds));
  }

  async function submitBulkStatus(accountStatus: 'ACTIVE' | 'INACTIVE') {
    if (selected.size === 0 || bulkSubmitting) return;

    setBulkSubmitting(true);
    setBulkError(null);

    // 서버가 한 요청당 최대 처리 건수를 제한하므로("전체 선택" 시 직원 수만큼 몰아 보내면
    // 검증에서 거부된다), 그 단위로 나눠 순차적으로 보내고 결과를 합산한다.
    const chunks = chunk([...selected], BULK_STATUS_CHUNK_SIZE);
    const combined: BulkStatusResult = { succeeded: [], failed: [] };

    for (const employeeUserIds of chunks) {
      const response = await apiRequest<BulkStatusResult>('/api/admin/employees/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ employeeUserIds, accountStatus }),
      });

      if (!response.ok) {
        setBulkSubmitting(false);
        setBulkError(response.error.message);
        // 이미 처리된 청크 결과는 남겨서 화면에 보여준다 — 중단됐어도 그만큼은 반영됐다.
        if (combined.succeeded.length > 0 || combined.failed.length > 0) {
          setBulkResult(combined);
        }
        return;
      }

      combined.succeeded.push(...response.data.succeeded);
      combined.failed.push(...response.data.failed);
    }

    setBulkSubmitting(false);
    setBulkResult(combined);
    setBulkMode(false);
    setSelected(new Set());
    router.refresh();
  }

  async function toggleStatus(user: EmployeeUser) {
    setPendingId(user.employeeUserId);
    setMessage(null);

    const nextStatus = user.accountStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const response = await apiRequest(`/api/admin/employees/${user.employeeUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ accountStatus: nextStatus }),
    });

    setPendingId(null);

    if (response.ok) {
      setMessage({
        variant: 'success',
        text:
          nextStatus === 'INACTIVE'
            ? `${user.name} 계정을 비활성화했습니다.`
            : `${user.name} 계정을 활성화했습니다.`,
      });
      router.refresh();
      return;
    }
    setMessage({ variant: 'error', text: response.error.message });
  }

  function toggleAddForm() {
    setShowAddForm((previous) => !previous);
    setAddForm(EMPTY_ADD_FORM);
    setAddFieldErrors({});
    setAddError(null);
  }

  async function submitAddForm() {
    if (addSubmitting) return;
    setAddSubmitting(true);
    setAddError(null);
    setAddFieldErrors({});

    const response = await apiRequest('/api/admin/employees', {
      method: 'POST',
      body: JSON.stringify(addForm),
    });

    setAddSubmitting(false);

    if (!response.ok) {
      setAddFieldErrors(response.error.fieldErrors ?? {});
      setAddError(response.error.message);
      return;
    }

    setShowAddForm(false);
    setAddForm(EMPTY_ADD_FORM);
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">
            직원 관리 ({filteredUsers.length}/{employeeUsers.length}명)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="input w-full sm:w-64"
              placeholder="이름·부서·이메일 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="직원 검색"
            />
            {!bulkMode && (
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 text-xs"
                onClick={startBulkMode}
              >
                선택
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary min-h-9 px-3 text-xs"
              onClick={toggleAddForm}
            >
              {showAddForm ? '취소' : '+ 직원 추가'}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="border-line bg-surface-muted mt-3 rounded-lg border p-3">
            {addError && (
              <div className="mb-3">
                <Alert variant="error">{addError}</Alert>
              </div>
            )}
            <p className="text-ink-muted mb-2 text-xs font-bold">
              사번으로 로그인 연동됩니다. 정확히 입력해 주세요.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="사번"
                htmlFor="new-employee-code"
                required
                errors={addFieldErrors.employeeCode}
              >
                <input
                  id="new-employee-code"
                  className={inputClassName(Boolean(addFieldErrors.employeeCode))}
                  value={addForm.employeeCode}
                  onChange={(event) => setAddForm({ ...addForm, employeeCode: event.target.value })}
                  maxLength={20}
                />
              </FormField>
              <FormField
                label="이름"
                htmlFor="new-employee-name"
                required
                errors={addFieldErrors.name}
              >
                <input
                  id="new-employee-name"
                  className={inputClassName(Boolean(addFieldErrors.name))}
                  value={addForm.name}
                  onChange={(event) => setAddForm({ ...addForm, name: event.target.value })}
                  maxLength={50}
                />
              </FormField>
              <FormField
                label="이메일"
                htmlFor="new-employee-email"
                required
                errors={addFieldErrors.email}
              >
                <input
                  id="new-employee-email"
                  type="email"
                  className={inputClassName(Boolean(addFieldErrors.email))}
                  value={addForm.email}
                  onChange={(event) => setAddForm({ ...addForm, email: event.target.value })}
                  maxLength={255}
                />
              </FormField>
              <FormField
                label="부서명"
                htmlFor="new-employee-department"
                required
                errors={addFieldErrors.departmentName}
              >
                <input
                  id="new-employee-department"
                  className={inputClassName(Boolean(addFieldErrors.departmentName))}
                  value={addForm.departmentName}
                  onChange={(event) =>
                    setAddForm({ ...addForm, departmentName: event.target.value })
                  }
                  maxLength={100}
                />
              </FormField>
              <FormField
                label="차량번호"
                htmlFor="new-employee-vehicle"
                errors={addFieldErrors.vehicleNo}
              >
                <input
                  id="new-employee-vehicle"
                  className={inputClassName(Boolean(addFieldErrors.vehicleNo))}
                  value={addForm.vehicleNo}
                  onChange={(event) => setAddForm({ ...addForm, vehicleNo: event.target.value })}
                  maxLength={20}
                />
              </FormField>
              <FormField
                label="소속 사업장명"
                htmlFor="new-employee-company"
                errors={addFieldErrors.companyOrBranchName}
              >
                <input
                  id="new-employee-company"
                  className={inputClassName(Boolean(addFieldErrors.companyOrBranchName))}
                  value={addForm.companyOrBranchName}
                  onChange={(event) =>
                    setAddForm({ ...addForm, companyOrBranchName: event.target.value })
                  }
                  maxLength={100}
                />
              </FormField>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 text-xs"
                disabled={
                  addSubmitting ||
                  !addForm.employeeCode ||
                  !addForm.name ||
                  !addForm.email ||
                  !addForm.departmentName
                }
                onClick={submitAddForm}
              >
                {addSubmitting ? '추가 중…' : '직원 추가'}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 text-xs"
                disabled={addSubmitting}
                onClick={toggleAddForm}
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="상태 필터">
          {(
            [
              { key: 'ALL', label: '전체' },
              { key: 'ACTIVE', label: '활성' },
              { key: 'INACTIVE', label: '비활성' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                statusFilter === tab.key
                  ? 'bg-brand-700 text-white'
                  : 'bg-surface-hover text-ink-muted hover:bg-surface-active'
              }`}
            >
              {tab.label} ({statusCounts[tab.key]})
            </button>
          ))}
        </div>

        <p className="field-hint mt-2">스위치를 끄면 퇴사자 등 해당 계정의 로그인을 막습니다.</p>

        {message && (
          <div className="mt-3">
            <Alert variant={message.variant === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          </div>
        )}

        {bulkResult && (
          <div className="mt-3">
            <Alert
              variant={bulkResult.failed.length === 0 ? 'success' : 'warning'}
              title="일괄 처리 결과"
            >
              <p>{bulkResult.succeeded.length}건 처리 완료.</p>
              {bulkResult.failed.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {bulkResult.failed.map((failure) => (
                    <li key={failure.employeeUserId}>
                      계정 ID {failure.employeeUserId}: {failure.message}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          </div>
        )}

        {bulkMode && (
          <div className="border-line bg-surface-muted mt-3 rounded-lg border p-3">
            {bulkError && (
              <div className="mb-3">
                <Alert variant="error">{bulkError}</Alert>
              </div>
            )}
            <p className="text-ink-muted text-sm font-bold">{selected.size}건 선택됨</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-9 px-3 text-xs"
                disabled={selected.size === 0 || bulkSubmitting}
                onClick={() => submitBulkStatus('ACTIVE')}
              >
                {bulkSubmitting ? '처리 중…' : `선택한 ${selected.size}건 활성화`}
              </button>
              <button
                type="button"
                className="btn btn-danger-outline min-h-9 px-3 text-xs"
                disabled={selected.size === 0 || bulkSubmitting}
                onClick={() => submitBulkStatus('INACTIVE')}
              >
                {bulkSubmitting ? '처리 중…' : `선택한 ${selected.size}건 비활성화`}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-9 px-3 text-xs"
                disabled={bulkSubmitting}
                onClick={cancelBulkMode}
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                {bulkMode && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      className="accent-brand-700 size-4"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      disabled={filteredIds.length === 0}
                      aria-label="전체 선택"
                    />
                  </th>
                )}
                <th>이름</th>
                <th>부서</th>
                <th>이메일</th>
                <th>상태</th>
                <th>마지막 로그인</th>
                {!bulkMode && <th className="w-12">활성</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={bulkMode ? 7 : 7} className="text-ink-faint text-center text-sm">
                    {employeeUsers.length === 0
                      ? '등록된 직원이 없습니다.'
                      : '검색 결과가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.employeeUserId}>
                    {bulkMode && (
                      <td>
                        <input
                          type="checkbox"
                          className="accent-brand-700 size-4"
                          checked={selected.has(user.employeeUserId)}
                          onChange={() => toggleSelected(user.employeeUserId)}
                          aria-label={`${user.email} 선택`}
                        />
                      </td>
                    )}
                    <td>{user.name}</td>
                    <td>{user.departmentName || '-'}</td>
                    <td className="text-xs">{user.email}</td>
                    <td>
                      <span className={`badge ${ACCOUNT_STATUS_CLASS[user.accountStatus]}`}>
                        {ACCOUNT_STATUS_LABEL[user.accountStatus]}
                      </span>
                    </td>
                    <td className="text-ink-faint text-xs whitespace-nowrap">
                      {user.lastLoginAt ? formatKstDateTime(new Date(user.lastLoginAt)) : '-'}
                    </td>
                    {!bulkMode && (
                      <td>
                        <ActiveSwitch
                          checked={user.accountStatus === 'ACTIVE'}
                          disabled={pendingId === user.employeeUserId}
                          label={`${user.email} ${user.accountStatus === 'ACTIVE' ? '비활성화' : '활성화'}`}
                          onToggle={() => toggleStatus(user)}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
