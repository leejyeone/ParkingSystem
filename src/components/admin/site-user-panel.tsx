'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { apiRequest } from '@/lib/client/api-client';
import { formatKstDateTime } from '@/lib/datetime';
import { useDismissOnInteraction } from '@/lib/hooks/use-dismiss-on-interaction';
import { SITE_USER_RESET_PASSWORD } from '@/domain/site-user';

type SiteUser = {
  userId: number;
  name: string;
  email: string;
  companyOrBranchName: string;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  lastLoginAt: string | null;
  createdAt: string;
};

type BulkStatusResult = {
  succeeded: number[];
  failed: { userId: number; message: string }[];
};

/**
 * 서버 스키마(`SITE_USER_BULK_STATUS_MAX`, src/lib/validation/user-schema.ts)의
 * 한 요청당 최대 처리 건수와 같은 값. "전체 선택" 시 이 단위로 나눠 순차 전송한다.
 */
const BULK_STATUS_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** 화면에는 "잠금" 개념을 따로 두지 않는다 — LOCKED 도 "비활성"과 같은 취급이다. */
function isActive(status: SiteUser['accountStatus']): boolean {
  return status === 'ACTIVE';
}

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

/**
 * 회원(SiteUser) 계정 목록.
 *
 * 등록 직원 관리 화면과 거의 동일하다 — 스위치로 바로 활성·비활성을 전환하고,
 * [선택]으로 여러 행을 골라 한 번에 처리할 수 있다. 다른 점은 회원은 비밀번호가
 * 있어 행마다 "비밀번호 재설정"을 제공한다는 것.
 */
export function SiteUserPanel({ siteUsers }: { siteUsers: SiteUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
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

  const [resetPendingId, setResetPendingId] = useState<number | null>(null);

  useDismissOnInteraction(Boolean(message || bulkResult || bulkError), () => {
    setMessage(null);
    setBulkResult(null);
    setBulkError(null);
  });

  const statusCounts = {
    ALL: siteUsers.length,
    ACTIVE: siteUsers.filter((user) => isActive(user.accountStatus)).length,
    INACTIVE: siteUsers.filter((user) => !isActive(user.accountStatus)).length,
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = siteUsers
    .filter(
      (user) =>
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' ? isActive(user.accountStatus) : !isActive(user.accountStatus)),
    )
    .filter(
      (user) =>
        !normalizedQuery ||
        [user.name, user.email, user.companyOrBranchName].some((field) =>
          field.toLowerCase().includes(normalizedQuery),
        ),
    );

  const filteredIds = filteredUsers.map((user) => user.userId);
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

  function toggleSelected(userId: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
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

    const chunks = chunk([...selected], BULK_STATUS_CHUNK_SIZE);
    const combined: BulkStatusResult = { succeeded: [], failed: [] };

    for (const userIds of chunks) {
      const response = await apiRequest<BulkStatusResult>('/api/admin/site-users/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ userIds, accountStatus }),
      });

      if (!response.ok) {
        setBulkSubmitting(false);
        setBulkError(response.error.message);
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

  async function toggleStatus(user: SiteUser) {
    setPendingId(user.userId);
    setMessage(null);

    const nextStatus = isActive(user.accountStatus) ? 'INACTIVE' : 'ACTIVE';
    const response = await apiRequest(`/api/admin/site-users/${user.userId}`, {
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

  async function resetPassword(user: SiteUser) {
    if (
      !window.confirm(
        `${user.name}(${user.email})의 비밀번호를 "${SITE_USER_RESET_PASSWORD}"로 초기화할까요?`,
      )
    )
      return;

    setResetPendingId(user.userId);
    setMessage(null);

    const response = await apiRequest(`/api/admin/site-users/${user.userId}/reset-password`, {
      method: 'POST',
    });

    setResetPendingId(null);

    if (response.ok) {
      setMessage({
        variant: 'success',
        text: `${user.name} 계정 비밀번호를 "${SITE_USER_RESET_PASSWORD}"로 초기화했습니다.`,
      });
      router.refresh();
      return;
    }
    setMessage({ variant: 'error', text: response.error.message });
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">
            회원 관리 ({filteredUsers.length}/{siteUsers.length}명)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="input w-full sm:w-64"
              placeholder="이름·이메일·소속 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="회원 검색"
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
          </div>
        </div>

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

        <p className="field-hint mt-2">스위치를 끄면 해당 계정의 로그인을 막습니다.</p>

        <div className="mt-3">
          <Alert variant="info" title="비밀번호 재설정 안내">
            비밀번호가 {' '}
            <span className="font-mono font-bold">{SITE_USER_RESET_PASSWORD}</span>로
            초기화됩니다. 회원에게 이 비밀번호를 안내해 주세요.
          </Alert>
        </div>

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
                    <li key={failure.userId}>
                      계정 ID {failure.userId}: {failure.message}
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
                <th className="w-18">이름</th>
                <th className="w-28">소속</th>
                <th className="w-30">이메일</th>
                <th className="w-16">상태</th>
                <th className="w-28">마지막 로그인</th>
                {!bulkMode && <th className="w-56">관리</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={bulkMode ? 6 : 7} className="text-ink-faint text-center text-sm">
                    {siteUsers.length === 0 ? '가입한 회원이 없습니다.' : '검색 결과가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.userId}>
                    {bulkMode && (
                      <td>
                        <input
                          type="checkbox"
                          className="accent-brand-700 size-4"
                          checked={selected.has(user.userId)}
                          onChange={() => toggleSelected(user.userId)}
                          aria-label={`${user.email} 선택`}
                        />
                      </td>
                    )}
                    <td>{user.name}</td>
                    <td>{user.companyOrBranchName || '-'}</td>
                    <td className="text-xs">{user.email}</td>
                    <td>
                      <span
                        className={`badge ${
                          isActive(user.accountStatus)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-surface-active text-ink-muted'
                        }`}
                      >
                        {isActive(user.accountStatus) ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="text-ink-faint text-xs whitespace-nowrap">
                      {user.lastLoginAt ? formatKstDateTime(new Date(user.lastLoginAt)) : '-'}
                    </td>
                    {!bulkMode && (
                      <td>
                        <div className="flex items-center justify-between gap-2">
                          <ActiveSwitch
                            checked={isActive(user.accountStatus)}
                            disabled={pendingId === user.userId}
                            label={`${user.email} ${isActive(user.accountStatus) ? '비활성화' : '활성화'}`}
                            onToggle={() => toggleStatus(user)}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary min-h-8 whitespace-nowrap px-2 text-xs"
                            disabled={resetPendingId === user.userId}
                            onClick={() => resetPassword(user)}
                          >
                            {resetPendingId === user.userId ? '처리 중…' : '비밀번호 재설정'}
                          </button>
                        </div>
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
