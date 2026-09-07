'use client';

import { useState, type InputHTMLAttributes } from 'react';

/**
 * 비밀번호 입력창 + 마스킹 해제 버튼.
 * 일반 <input>과 동일하게 쓰되 type 은 내부에서 관리한다(항상 password 로 시작).
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className ?? ''} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((previous) => !previous)}
        className="text-ink-faint hover:text-ink-muted absolute inset-y-0 right-0 flex items-center px-3"
        // "비밀번호"라는 단어를 그대로 쓰면 Playwright getByLabel('비밀번호')(부분일치)가
        // 이 버튼까지 같이 집어서 "요소 2개" 오류가 난다 — 일부러 다른 단어를 쓴다.
        aria-label={visible ? '입력 내용 가리기' : '입력 내용 보이기'}
      >
        {visible ? (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
