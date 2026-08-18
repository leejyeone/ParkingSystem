import type { Metadata } from 'next';
import Link from 'next/link';

import { ReservationForm } from '@/components/reservation/reservation-form';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '주차 신청' };

export default async function NewReservationPage() {
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);

  return (
    <main className="app-container pb-4">
      <div className="mb-4">
        <Link href="/" className="text-brand-700 text-sm font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">주차 신청</h1>
        <p className="mt-1 text-sm text-slate-600">
          별도 가입 없이 신청할 수 있습니다. 표시된 항목(*)은 필수입니다.
        </p>
      </div>

      <ReservationForm
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          parkingOpenTime: settings.parkingOpenTime,
          parkingCloseTime: settings.parkingCloseTime,
          maxReservationHours: settings.maxReservationHours,
          // 기기 타임존에 상관없이 Asia/Seoul 기준으로 최소 선택 가능 시각을 계산한다.
          minDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes,
            settings.appTimeZone,
          ),
        }}
      />
    </main>
  );
}
