import Link from 'next/link';

import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

/** 메인 화면. 모바일에서 버튼을 크고 명확하게 노출한다. */
export default async function HomePage() {
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);

  return (
    <main className="app-container">
      <header className="mb-6 text-center">
        <p className="text-brand-700 text-xs font-bold tracking-widest">SYNOPEX PARKING</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">본사 주차 예약</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          방문객과 타 지사 직원 모두 별도 가입 없이 주차를 신청할 수 있습니다.
        </p>
      </header>

      <nav className="grid gap-3">
        <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
          주차 신청하기
        </Link>
        <Link href="/reservations/lookup" className="btn btn-secondary btn-lg w-full">
          내 예약 조회하기
        </Link>
        <Link href="/admin/login" className="btn btn-ghost w-full">
          관리자 로그인
        </Link>
      </nav>

      <section className="card mt-6">
        <div className="card-body">
          <h2 className="card-title">이용 안내</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              • 주차장 운영시간은 <strong>{settings.parkingOpenTime}</strong> ~{' '}
              <strong>{settings.parkingCloseTime}</strong> 입니다.
            </li>
            <li>
              • 신청은 방문 시작 <strong>{settings.reservationMinLeadMinutes}분 전</strong>까지
              가능하며, 같은 시점까지 수정·취소할 수 있습니다.
            </li>
            <li>
              • 주차 위치는 시스템이 추천하고 관리자가 최종 확정합니다. 직접 선택할 수 없습니다.
            </li>
            <li>• 신청 결과와 예약 조회 링크는 입력하신 이메일로 발송됩니다.</li>
            <li>
              • 출차 예정 <strong>{settings.exitReminderMinutes}분 전</strong>에 안내 메일이
              발송됩니다.
            </li>
          </ul>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs text-slate-400">
        <p>본 시스템은 사내 업무용으로만 사용됩니다.</p>
      </footer>
    </main>
  );
}
