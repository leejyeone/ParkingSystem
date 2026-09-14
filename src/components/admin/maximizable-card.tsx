'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

const MaximizedContext = createContext(false);

/** 지금 이 화면이 (Fullscreen API 로) 최대화된 MaximizableCard 안에 있는지 여부. */
export function useIsMaximized(): boolean {
  return useContext(MaximizedContext);
}

/**
 * 관리실 모니터에 이 카드만 상시 띄워 두는 용도 — 브라우저 Fullscreen API 로 이 카드
 * 하나만 화면 전체를 채운다(다른 카드·사이드바·주소창까지 가려짐). 평소(비최대화)엔
 * 페이지 안의 평범한 카드로, 페이지 자체 스크롤에 맡긴다 — 최대화 기능이 있으니 카드
 * 안에 별도 스크롤 영역을 둘 필요가 없다.
 */
export function MaximizableCard({
  header,
  children,
}: {
  /** 최대화 버튼과 같은 행에 나란히 둘 내용(예: 시계) */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setMaximized(document.fullscreenElement === sectionRef.current);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function toggle() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await sectionRef.current?.requestFullscreen();
  }

  return (
    <section ref={sectionRef} className={`card ${maximized ? 'flex flex-col' : ''}`}>
      <div className={`card-body ${maximized ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
        {/*
          header 안의 내용(예: 승인대기 뱃지)도 최대화 여부에 따라 스스로 모습을 바꿔야 할 수
          있어 Provider 를 children 뿐 아니라 header 까지 감싸도록 넓힌다.
        */}
        <MaximizedContext.Provider value={maximized}>
          <div className="flex items-center justify-between gap-2">
            {header}
            <button
              type="button"
              className="btn btn-secondary btn-sm !px-2"
              aria-label={maximized ? '축소' : '최대화'}
              title={maximized ? '축소' : '최대화'}
              onClick={toggle}
            >
              {maximized ? <ContractIcon /> : <ExpandIcon />}
            </button>
          </div>
          <div className={maximized ? 'mt-2 min-h-0 flex-1' : 'mt-2'}>{children}</div>
        </MaximizedContext.Provider>
      </div>
    </section>
  );
}

/** 우상향 대각선 화살표 — "이 카드를 화면 전체로 키운다"는 뜻의 최대화 아이콘 */
function ExpandIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7M17 7H9M17 7V15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 좌하향 대각선 화살표 — 최대화 아이콘을 뒤집은 모양의 축소(원복) 아이콘 */
function ContractIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 7L7 17M7 17H15M7 17V9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
