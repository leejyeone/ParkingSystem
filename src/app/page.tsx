import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { getUserSession } from '@/lib/user-session';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 메인 화면. 모바일에서 버튼을 크고 명확하게 노출한다. */
export default async function HomePage({ searchParams }: PageProps) {
  // 사내망 "다른 사이트 로그인 연동"이 `/?fsacode=사번` 형태로 루트에 착지한다(대소문자
  // 표기가 시스템마다 다를 수 있어 대소문자 구분 없이 찾는다). 발견하면 실제 세션 발급
  // 로직(`GET /api/employee/enter`)으로 그대로 넘긴다 — 로직을 여기서 중복하지 않는다.
  // redirect 를 따로 지정하지 않으면 `safeEmployeeRedirect` 기본값인 `/employee` 로 간다.
  const params = await searchParams;
  const fsacodeKey = Object.keys(params).find((key) => key.toLowerCase() === 'fsacode');
  const fsacode = fsacodeKey ? params[fsacodeKey] : undefined;
  const fsacodeValue = Array.isArray(fsacode) ? fsacode[0] : fsacode;
  if (fsacodeValue?.trim()) {
    redirect(`/api/employee/enter?empId=${encodeURIComponent(fsacodeValue.trim())}`);
  }

  const [settings, session] = await Promise.all([
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
    getUserSession(),
  ]);

  return (
    <main className="app-container">
      <header className="mb-6 text-center">
        <p className="text-brand-700 text-xs font-bold tracking-widest">SYNOPEX VISIT</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">시노펙스 방문 예약</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          시노펙스 동탄 사업장의 방문을 신청할 수 있습니다.
        </p>
      </header>

      <nav className="grid gap-3">
        <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
          방문 신청하기
        </Link>
        {/* 로그인하면 마이페이지에서 내 예약을 바로 볼 수 있으므로 예약번호 조회는 감춘다. */}
        {session ? (
          <Link href="/mypage" className="btn btn-secondary btn-lg w-full">
            마이페이지 ({session.name}님)
          </Link>
        ) : (
          <>
            <Link href="/reservations/lookup" className="btn btn-secondary btn-lg w-full">
              내 예약 조회하기
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/login" className="btn btn-secondary w-full">
                로그인
              </Link>
              <Link href="/signup" className="btn btn-secondary w-full">
                회원가입
              </Link>
            </div>
          </>
        )}
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
              {settings.spaceAssignmentEnabled
                ? '• 주차 위치는 관리자가 배정합니다. 직접 선택할 수 없습니다.'
                : '• 주차 위치는 지정되지 않습니다. 승인 후 현장 안내에 따라 주차해 주세요.'}
            </li>
            <li>• 신청 결과와 예약 조회 링크는 입력하신 이메일로 발송됩니다.</li>
            <li>• 예약 조회는 성명·차량번호로 하거나, 안내 메일의 링크를 이용하면 됩니다.</li>
            <li>• 로그인하면 신청 시 내 정보가 자동으로 입력됩니다. (선택 사항)</li>
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
