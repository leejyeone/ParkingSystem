import type { Metadata } from 'next';
import Link from 'next/link';

import { ReservationLookupForm } from '@/components/reservation/reservation-lookup-form';
import { Alert } from '@/components/ui/alert';
import { resolveHomeHref } from '@/lib/home-link';
import { getUserSession } from '@/lib/user-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '내 예약 조회' };

/**
 * 예약 조회 화면.
 *
 * 조회 경로는 두 가지다.
 *  1) 예약자 성명 + 차량번호 입력 (이 화면)
 *  2) 접수/승인 메일에 포함된 보안 링크 (/r/<token>)
 */
export default async function ReservationLookupPage() {
  const [session, homeHref] = await Promise.all([getUserSession(), resolveHomeHref()]);

  return (
    <main className="app-container">
      <div className="mb-4">
        <Link href={homeHref} className="text-brand-700 text-sm font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">내 예약 조회</h1>
        <p className="mt-1 text-sm text-slate-600">
          신청 시 입력한 성명과 차량번호를 입력하시면 일치하는 예약을 모두 보여드립니다. 목록에서
          예약을 고르면 내용을 확인하고 수정·취소할 수 있습니다.
        </p>
      </div>

      <div className="space-y-4">
        <ReservationLookupForm />

        {session ? (
          <Alert variant="info" title="로그인 중입니다">
            <p>예약 내역에서 내가 신청한 예약을 한 번에 볼 수 있습니다.</p>
            <p className="mt-2">
              <Link
                href="/mypage/reservations"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
              >
                예약 내역으로 이동
              </Link>
            </p>
          </Alert>
        ) : (
          <Alert variant="info" title="로그인하면 더 편리합니다">
            <p>로그인하면 성명·차량번호 입력 없이도 내가 신청한 예약을 모두 볼 수 있습니다.</p>
            <p className="mt-2 flex flex-wrap gap-2">
              <Link href="/login" className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs">
                로그인
              </Link>
              <Link href="/signup" className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs">
                회원가입
              </Link>
            </p>
          </Alert>
        )}

        <section className="card">
          <div className="card-body">
            <h2 className="card-title">검색이 안 되시나요?</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
              <li>• 성명과 차량번호는 신청 당시 입력한 값과 정확히 같아야 검색됩니다.</li>
              <li>
                • 신청 시 입력한 이메일에서 제목이{' '}
                <strong>[시노펙스] 방문 신청이 접수되었습니다</strong> 인 메일을 확인해 주세요. 조회
                링크가 함께 있습니다.
              </li>
              <li>• 메일이 없다면 스팸함을 확인하시고, 그래도 없으면 새로 신청해 주세요.</li>
            </ul>
          </div>
        </section>

        <Link href="/reservations/new" className="btn btn-secondary w-full">
          새로 방문 신청하기
        </Link>
      </div>
    </main>
  );
}
