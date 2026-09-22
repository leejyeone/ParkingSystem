'use client';

import { useEffect, type RefObject } from 'react';

/**
 * active가 true인 동안 문서 아무 곳이나 클릭하면 onDismiss를 한 번 호출한다.
 * 알림을 띄운 그 클릭 이후 렌더에서 리스너가 붙기 때문에, 알림을 만든 클릭 자체에는
 * 반응하지 않고 다음 클릭부터 지운다.
 *
 * `excludeRef`를 주면 그 요소 안쪽 클릭은 무시한다 — 드롭다운/리스트박스처럼 "바깥을
 * 눌러야 닫히는" 대상이 있을 때 쓴다. 캡처 단계 리스너라 이걸 안 주면 리스트박스 안의
 * 항목을 눌러도 그 클릭이 항목의 onClick에 닿기 전에 먼저 닫혀버려 선택이 씹힌다.
 */
export function useDismissOnInteraction(
  active: boolean,
  onDismiss: () => void,
  excludeRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      if (excludeRef?.current?.contains(event.target as Node)) return;
      onDismiss();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [active, onDismiss, excludeRef]);
}
