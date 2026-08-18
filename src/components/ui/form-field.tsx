'use client';

import type { ReactNode } from 'react';

/** 라벨 + 입력 + 필드별 오류 메시지를 묶는 공통 폼 필드 */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
  children: ReactNode;
}) {
  const hasError = Boolean(errors && errors.length > 0);

  return (
    <div>
      <label htmlFor={htmlFor} className={`label ${required ? 'label-required' : ''}`}>
        {label}
      </label>
      {children}
      {hint && !hasError && <p className="field-hint">{hint}</p>}
      {hasError && (
        <p className="field-error" id={`${htmlFor}-error`} role="alert">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}

export function inputClassName(hasError: boolean): string {
  return `input ${hasError ? 'input-error' : ''}`;
}
