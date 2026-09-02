import Link from 'next/link';

import { Alert } from '@/components/ui/alert';
import { resolveHomeHref } from '@/lib/home-link';

export default async function NotFound() {
  const homeHref = await resolveHomeHref();

  return (
    <main className="app-container">
      <h1 className="mb-4 text-xl font-black text-slate-900 sm:text-2xl">
        페이지를 찾을 수 없습니다
      </h1>
      <div className="space-y-4">
        <Alert variant="error" title="요청하신 페이지가 없습니다">
          <p>주소가 잘못되었거나, 더 이상 존재하지 않는 페이지입니다.</p>
        </Alert>
        <Link href="/reservations/lookup" className="btn btn-secondary w-full">
          예약 조회하기
        </Link>
        <Link href={homeHref} className="btn btn-primary w-full">
          처음으로
        </Link>
      </div>
    </main>
  );
}
