'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';

export type FilterChip = {
  /** 검색 조건 이름 (예: 날짜, 상태) */
  label: string;
  /** 사람이 읽는 적용 값 */
  value: string;
  /** 이 조건만 해제한 목록으로 가는 링크 */
  removeHref: string;
};

/**
 * 관리자 목록 화면 공통 검색 조건 바. (예약 목록 / 이메일 발송 이력)
 *
 * 모바일에서 입력 필드가 화면을 다 차지하지 않도록 **기본은 접힌 상태**이고,
 * 실제로 적용된 조건만 칩으로 보여준다. 검색 조건 버튼을 눌러야 입력 폼이 펼쳐진다.
 */
export function FilterBar({
  chips,
  resetHref,
  emptyLabel,
  children,
}: {
  chips: FilterChip[];
  resetHref: string;
  /** 조건이 하나도 없을 때 보여줄 안내 문구 (예: "전체 예약을 보고 있습니다.") */
  emptyLabel: string;
  children: ReactNode;
}) {
  // 조건이 하나도 없으면 굳이 펼쳐 두지 않는다. 적용된 조건이 있어도 칩으로 충분히 보인다.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasChips = chips.length > 0;

  return (
    <section className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary min-h-10 px-3 py-2 text-sm"
            onClick={() => setOpen((previous) => !previous)}
            aria-expanded={open}
            aria-controls={panelId}
            data-testid="filter-toggle"
          >
            <span>검색 조건</span>
            {hasChips && (
              <span className="badge bg-brand-100 text-brand-900 ml-1">{chips.length}</span>
            )}
            <span aria-hidden className="ml-1 text-xs">
              {open ? '▲' : '▼'}
            </span>
          </button>

          {!hasChips && !open && <span className="text-ink-faint text-sm">{emptyLabel}</span>}

          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.removeHref}
              className="badge bg-surface-hover text-ink-muted hover:bg-surface-active"
              title={`${chip.label} 조건 해제`}
            >
              <span className="text-ink-faint font-normal">{chip.label}</span>
              <span className="font-bold">{chip.value}</span>
              <span aria-hidden className="text-ink-faint">
                ✕
              </span>
              <span className="sr-only">조건 해제</span>
            </Link>
          ))}

          {hasChips && (
            <Link href={resetHref} className="text-ink-faint text-xs font-bold underline">
              전체 해제
            </Link>
          )}
        </div>

        {open && (
          <div id={panelId} className="border-line-muted mt-4 border-t pt-4">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
