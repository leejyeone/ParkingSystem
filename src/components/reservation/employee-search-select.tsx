'use client';

import { useEffect, useRef, useState } from 'react';

import { apiRequest } from '@/lib/client/api-client';

export type SelectedEmployee = {
  employeeUserId: number;
  /** 입력창에 그대로 보여줄 표시 문구 (이름 + 부서/사업장명) */
  label: string;
};

type EmployeeDirectoryEntry = {
  employeeUserId: number;
  name: string;
  departmentName: string;
};

function toLabel(entry: EmployeeDirectoryEntry): string {
  return entry.departmentName ? `${entry.name} (${entry.departmentName})` : entry.name;
}

/**
 * "당사 담당자" 검색·선택 콤보박스.
 *
 * 직원 DB(활성 계정)에서 이름·부서·사업장명으로 검색해 고른다. 선택 후 다시 입력하면
 * 선택이 풀리고 새로 검색된다 — 그래야 다른 담당자로 바꿀 수 있다.
 */
export function EmployeeSearchSelect({
  id,
  value,
  onChange,
  hasError,
}: {
  id: string;
  value: SelectedEmployee | null;
  onChange: (value: SelectedEmployee | null) => void;
  hasError?: boolean;
}) {
  // value 는 최초 마운트 시(예: 대리 신청 화면의 기본 담당자) 한 번 초기값으로만 쓰고,
  // 이후로는 이 컴포넌트가 query/선택 상태를 직접 관리한다(부모가 나중에 바깥에서
  // value 를 바꾸는 사용 사례가 없다).
  const [query, setQuery] = useState(value?.label ?? '');
  const [options, setOptions] = useState<EmployeeDirectoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    // 2자 미만일 때 옵션을 비우는 것은 handleQueryChange 에서 즉시 처리한다.
    // 성 한 글자만으로 직원 목록이 노출되는 것을 막기 위해 최소 2자부터 검색한다.
    if (trimmed.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await apiRequest<{ employees: EmployeeDirectoryEntry[] }>(
        '/api/employees/search',
        { method: 'POST', body: JSON.stringify({ query: trimmed }) },
      );
      setLoading(false);
      setOptions(response.ok ? response.data.employees : []);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  function handleQueryChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (value) onChange(null);
    if (next.trim().length < 2) setOptions([]);
  }

  function handleSelect(entry: EmployeeDirectoryEntry) {
    const label = toLabel(entry);
    onChange({ employeeUserId: entry.employeeUserId, label });
    setQuery(label);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        className={`input ${hasError ? 'input-error' : value ? 'input-selected' : ''}`}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="이름 또는 부서명으로 검색 (2자 이상)"
        autoComplete="off"
      />
      {open && query.trim() !== '' && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {query.trim().length < 2 ? (
            <p className="p-3 text-sm text-slate-500">2자 이상 입력해 주세요.</p>
          ) : loading ? (
            <p className="p-3 text-sm text-slate-500">검색 중…</p>
          ) : options.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">일치하는 직원이 없습니다.</p>
          ) : (
            <ul>
              {options.map((entry) => (
                <li key={entry.employeeUserId}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => handleSelect(entry)}
                  >
                    <span className="font-semibold text-slate-900">{entry.name}</span>
                    <span className="ml-1 text-xs text-slate-500">{entry.departmentName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
