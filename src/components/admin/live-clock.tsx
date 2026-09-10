'use client';

import { useEffect, useState } from 'react';

import { formatKstHuman } from '@/lib/datetime';

/**
 * 서버 재조회 주기가 아니라 실제 지금 시각을 그대로 보여주는 시계.
 * 화면이 "살아 있다"는 걸 보여주는 용도라, 새로고침 주기와 무관하게 매 초 갱신한다.
 */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="text-ink text-xl font-black sm:text-2xl">{formatKstHuman(now)}</span>;
}
