import Link from 'next/link';

/** 직원/방문객 홈에서 공용으로 쓰는 아이콘+제목+설명 액션 카드. */
export function ActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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
