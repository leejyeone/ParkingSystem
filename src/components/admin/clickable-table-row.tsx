'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * 행 전체를 눌러 상세 화면으로 이동하는 표 행.
 *
 * 접근성을 위해 행 안에는 실제 링크(예약번호)를 함께 두고, 이 컴포넌트는
 * "행 아무 곳이나 눌러도 이동" 하는 편의만 더한다.
 * (키보드 사용자와 새 탭 열기는 그 링크로 처리된다)
 */
export function ClickableTableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    // 행 안의 링크·버튼을 눌렀다면 그쪽 동작에 맡긴다.
    if ((event.target as HTMLElement).closest('a, button')) return;
    // 텍스트를 드래그해 선택하는 중이면 이동하지 않는다.
    if (window.getSelection()?.toString()) return;

    router.push(href);
  }

  return (
    <tr
      onClick={handleClick}
      className="cursor-pointer transition hover:bg-slate-50"
      data-testid="reservation-row"
    >
      {children}
    </tr>
  );
}
