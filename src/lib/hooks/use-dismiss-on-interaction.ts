'use client';

import { useEffect } from 'react';

/**
 * active가 true인 동안 문서 아무 곳이나 클릭하면 onDismiss를 한 번 호출한다.
 * 알림을 띄운 그 클릭 이후 렌더에서 리스너가 붙기 때문에, 알림을 만든 클릭 자체에는
 * 반응하지 않고 다음 클릭부터 지운다.
 */
export function useDismissOnInteraction(active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return;

    const handleClick = () => onDismiss();
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [active, onDismiss]);
}
