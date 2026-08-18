import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: '내 예약 조회' };

/**
 * 예약 조회 안내 화면.
 *
 * 설계 제약상 "예약번호만 입력해 조회하는 화면"은 제공하지 않는다.
 * 예약 조회는 이메일로 발송된 보안 토큰 링크로만 가능하다.
 */
export default function ReservationLookupGuidePage() {
  return (
    <main className="app-container">
      <div className="mb-4">
        <Link href="/" className="text-brand-700 text-sm font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">내 예약 조회</h1>
      </div>

      <div className="space-y-4">
        <Alert variant="info" title="예약 조회는 이메일 링크로만 가능합니다">
          <p>
            개인정보 보호를 위해 예약번호나 이름만으로는 예약을 조회할 수 없습니다. 신청 시 입력하신
            이메일로 발송된 <strong>예약 조회 링크</strong>를 이용해 주세요.
          </p>
        </Alert>

        <section className="card">
          <div className="card-body">
            <h2 className="card-title">이메일에서 링크를 찾는 방법</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>신청 시 입력한 이메일 사서함을 확인합니다.</li>
              <li>
                제목이 <strong>[본사 주차] 주차 신청이 접수되었습니다</strong> 인 메일을 엽니다.
              </li>
              <li>
                본문 하단의 <strong>내 예약 조회하기</strong> 버튼(또는 주소)을 선택합니다.
              </li>
              <li>승인/반려/변경 메일에도 동일한 조회 링크가 포함되어 있습니다.</li>
            </ol>
          </div>
        </section>

        <section className="card">
          <div className="card-body">
            <h2 className="card-title">메일이 오지 않았다면</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
              <li>• 스팸함 또는 프로모션함을 확인해 주세요.</li>
              <li>• 이메일 주소를 잘못 입력한 경우 새로 신청해 주세요.</li>
              <li>• 그래도 확인되지 않으면 방문 담당자 또는 주차 관리 담당자에게 문의해 주세요.</li>
            </ul>
          </div>
        </section>

        <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
          새로 주차 신청하기
        </Link>
      </div>
    </main>
  );
}
