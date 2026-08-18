import type { ReactNode } from 'react';

const VARIANT_CLASS = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
} as const;

export type AlertVariant = keyof typeof VARIANT_CLASS;

export function Alert({
  variant = 'info',
  title,
  children,
}: {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 text-sm sm:p-4 ${VARIANT_CLASS[variant]}`} role="alert">
      {title && <p className="mb-1 font-bold">{title}</p>}
      {children && <div className="leading-relaxed">{children}</div>}
    </div>
  );
}
