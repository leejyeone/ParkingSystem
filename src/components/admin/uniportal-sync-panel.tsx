'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { apiRequest } from '@/lib/client/api-client';

/**
 * 그룹웨어(유니포탈) 직원 명부 갱신 버튼.
 *
 * 두 단계로 나눈 이유: 첫 실행에서 수백 명의 부서가 한꺼번에 바뀔 수 있어서, 무엇이 바뀌는지
 * 먼저 보여 주고 확인을 받는다. 미리보기는 DB 를 전혀 건드리지 않는다.
 */

type SyncRow = {
  email: string;
  name: string;
  departmentName: string;
  employeeCode: string | null;
  changes?: string[];
};

type CodeIssueRow = SyncRow & {
  reason: 'NO_EMPLOYEE_CODE' | 'DUPLICATE_EMPLOYEE_CODE';
  conflictWith?: string[];
};

type SyncPlan = {
  mode: 'preview' | 'apply';
  sourceCount: number;
  localCount: number;
  create: SyncRow[];
  update: SyncRow[];
  deactivate: SyncRow[];
  codeIssues: CodeIssueRow[];
  unchangedCount: number;
  createdCount?: number;
  updatedCount?: number;
  deactivatedCount?: number;
};

const PREVIEW_ROW_LIMIT = 50;

export function UniportalSyncPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: 'preview' | 'apply') {
    if (busy) return;
    setBusy(mode);
    setError(null);
    const response = await apiRequest<SyncPlan>('/api/admin/employees/sync', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    setBusy(null);

    if (!response.ok) {
      setError(response.error.message ?? '명부 갱신에 실패했습니다.');
      return;
    }

    setPlan(response.data);
    if (mode === 'apply') router.refresh();
  }

  if (!configured) return null;

  const applied = plan?.mode === 'apply';
  const nothingToDo =
    plan !== null &&
    plan.create.length === 0 &&
    plan.update.length === 0 &&
    plan.deactivate.length === 0;

  return (
    <section className="card">
      <div className="card-body space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="card-title">그룹웨어 명부 갱신</h2>
            <p className="text-ink-muted mt-1 text-sm">
              유니포탈 재직자 명부를 읽어 이름·부서·사번을 맞춥니다. 이메일이 기준입니다. 차량번호와
              계정 상태는 바뀌지 않고, 직원을 삭제하지도 않습니다.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary min-h-9 px-3 text-xs"
            onClick={() => run('preview')}
            disabled={busy !== null}
          >
            {busy === 'preview' ? '확인 중…' : '변경 내용 확인'}
          </button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {plan && (
          <div className="border-line bg-surface-muted space-y-3 rounded-lg border p-3">
            {applied ? (
              <Alert variant="success">
                갱신했습니다. 추가 {plan.createdCount}명 · 수정 {plan.updatedCount}명 · 비활성{' '}
                {plan.deactivatedCount}명
              </Alert>
            ) : nothingToDo ? (
              <Alert variant="info">바뀔 내용이 없습니다. 명부가 이미 최신입니다.</Alert>
            ) : (
              <Alert variant="warning">
                아래 내용이 반영됩니다. 확인 후 [갱신 실행]을 눌러 주세요.
              </Alert>
            )}

            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <Stat label="그룹웨어 재직자" value={plan.sourceCount} />
              <Stat label="추가" value={plan.create.length} />
              <Stat label="수정" value={plan.update.length} />
              <Stat label="비활성" value={plan.deactivate.length} />
              <Stat label="변경 없음" value={plan.unchangedCount} />
            </dl>

            <RowGroup
              title="추가"
              hint="새로 등록됩니다. 공용 계정이 섞여 들어올 수 있어 비활성 상태로 만들어지며, 필요한 사람만 활성으로 바꿔 주세요."
              rows={plan.create}
            />
            <RowGroup title="수정" rows={plan.update} />
            <RowGroup
              title="비활성"
              hint="그룹웨어 재직자 명단에서 사라진 사람입니다. 삭제하지 않고 비활성으로만 바꿉니다."
              rows={plan.deactivate}
            />

            {plan.codeIssues.length > 0 && (
              <div>
                <h3 className="text-ink text-sm font-bold">
                  사번 확인 필요 ({plan.codeIssues.length}명)
                </h3>
                <p className="text-ink-muted mt-1 text-xs">
                  그룹웨어에서 사번을 확정할 수 없어 사번 없이 등록됩니다. 이름·부서 검색과 담당자
                  지정은 정상이며, 사번(fsacode) 자동 로그인만 되지 않습니다. 이메일 진입은 됩니다.
                </p>
                <ul className="text-ink-muted mt-2 space-y-1 text-xs">
                  {plan.codeIssues.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                    <li key={`issue-${row.email}`}>
                      {row.name || '(이름 없음)'} · {row.departmentName || '-'} · {row.email} —{' '}
                      {row.reason === 'NO_EMPLOYEE_CODE'
                        ? '그룹웨어에 사번이 없음'
                        : `사번 중복 (${(row.conflictWith ?? []).join(', ')} 와 같은 사번)`}
                    </li>
                  ))}
                  {plan.codeIssues.length > PREVIEW_ROW_LIMIT && (
                    <li>… 외 {plan.codeIssues.length - PREVIEW_ROW_LIMIT}명</li>
                  )}
                </ul>
              </div>
            )}

            {!applied && !nothingToDo && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary min-h-9 px-3 text-xs"
                  onClick={() => run('apply')}
                  disabled={busy !== null}
                >
                  {busy === 'apply' ? '갱신 중…' : '갱신 실행'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-9 px-3 text-xs"
                  onClick={() => setPlan(null)}
                  disabled={busy !== null}
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-line bg-surface rounded border p-2">
      <dt className="text-ink-muted text-xs">{label}</dt>
      <dd className="text-ink text-base font-bold">{value}</dd>
    </div>
  );
}

function RowGroup({ title, rows, hint }: { title: string; rows: SyncRow[]; hint?: string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-ink text-sm font-bold">
        {title} ({rows.length}명)
      </h3>
      {hint && <p className="text-ink-muted mt-1 text-xs">{hint}</p>}
      <ul className="text-ink-muted mt-2 space-y-1 text-xs">
        {rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
          <li key={`${title}-${row.email}`}>
            {row.name || '(이름 없음)'} · {row.departmentName || '-'} · {row.email}
            {row.changes && row.changes.length > 0 && (
              <span className="text-ink"> — {row.changes.join(', ')}</span>
            )}
          </li>
        ))}
        {rows.length > PREVIEW_ROW_LIMIT && <li>… 외 {rows.length - PREVIEW_ROW_LIMIT}명</li>}
      </ul>
    </div>
  );
}
