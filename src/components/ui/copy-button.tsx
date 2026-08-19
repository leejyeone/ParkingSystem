'use client';

import { useState } from 'react';

/**
 * 값을 클립보드에 복사하는 버튼.
 *
 * navigator.clipboard 는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작하므로,
 * 사용할 수 없는 환경에서는 임시 textarea + execCommand 로 대체한다.
 */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 권한 거부 등 - 아래 대체 방식으로 넘어간다.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({
  value,
  label = '복사',
  className = 'btn btn-secondary min-h-9 px-3 py-1.5 text-xs',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>('idle');

  async function handleClick() {
    const copied = await copyToClipboard(value);
    setState(copied ? 'copied' : 'failed');
    window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        onClick={handleClick}
        aria-label={`${label} (${value})`}
        data-testid="copy-button"
      >
        {state === 'copied' ? '복사됨' : label}
      </button>
      {/* 스크린리더에도 결과를 알린다 */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? '클립보드에 복사했습니다.' : ''}
      </span>
      {state === 'failed' && (
        <span className="text-xs text-red-600">
          복사에 실패했습니다. 직접 선택해 복사해 주세요.
        </span>
      )}
    </span>
  );
}
