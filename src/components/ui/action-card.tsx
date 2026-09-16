import Link from 'next/link';

/** 직원/방문객 홈에서 공용으로 쓰는 아이콘+제목+설명 액션 카드. */
export function ActionCard({
  href,
  icon,
  title,
  description,
  disabled,
  disabledLabel,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** true면 링크로 이동하지 않는 비활성 카드로 표시한다(준비 중인 기능 숨김 처리용). */
  disabled?: boolean;
  /** 비활성 카드에 붙일 배지 문구. 기본값 "준비 중". */
  disabledLabel?: string;
}) {
  if (disabled) {
    return (
      <div className="border-line relative flex cursor-not-allowed flex-col items-center gap-2 rounded-xl border bg-white p-5 text-center opacity-50">
        <span className="bg-surface-hover text-ink-faint absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold">
          {disabledLabel ?? '준비 중'}
        </span>
        <span className="bg-brand-100 text-brand-700 flex size-12 items-center justify-center rounded-full">
          {icon}
        </span>
        <span className="text-ink text-base font-bold">{title}</span>
        <span className="text-ink-muted text-xs leading-relaxed">{description}</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="border-line hover:border-brand-500 flex flex-col items-center gap-2 rounded-xl border bg-white p-5 text-center transition hover:bg-white"
    >
      <span className="bg-brand-100 text-brand-700 flex size-12 items-center justify-center rounded-full">
        {icon}
      </span>
      <span className="text-ink text-base font-bold">{title}</span>
      <span className="text-ink-muted text-xs leading-relaxed">{description}</span>
    </Link>
  );
}
