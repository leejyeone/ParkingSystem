import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ReservationForm,
  type ReservationFormInitialValues,
} from '@/components/reservation/reservation-form';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { resolveHomeHref } from '@/lib/home-link';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile } from '@/services/user-auth-service';
import { requireUserPage } from '@/lib/user-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '방문 신청' };

export default async function NewReservationPage() {
  // 방문 신청은 회원가입·로그인이 필수다. 비로그인이면 로그인 화면으로 보내고,
  // 로그인 후 이 페이지로 그대로 돌아온다(safeUserRedirect 허용 목록에 이미 포함).
  const session = await requireUserPage('/reservations/new');
  const [settings, homeHref, profile] = await Promise.all([
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
    resolveHomeHref(),
    getUserProfile(session.userId),
  ]);

  const initialValues: ReservationFormInitialValues | undefined = profile
    ? {
        companyOrBranchName: profile.companyOrBranchName,
        requesterName: profile.name,
        requesterEmail: profile.email,
        vehicleNo: profile.vehicleNo ?? '',
      }
    : undefined;

  return (
    <main className="app-container pb-4">
      <div className="mb-4">
        <Link href={homeHref} className="text-brand-700 text-sm font-semibold">
          ← 처음으로
        </Link>
        <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">방문 신청</h1>
        <p className="mt-1 text-sm text-slate-600">표시된 항목(*)은 필수입니다.</p>
      </div>

      <ReservationForm
        mode="visitor"
        initialValues={initialValues}
        settings={{
          reservationMinLeadMinutes: settings.reservationMinLeadMinutes,
          parkingOpenTime: settings.parkingOpenTime,
          parkingCloseTime: settings.parkingCloseTime,
          maxReservationHours: settings.maxReservationHours,
          spaceAssignmentEnabled: settings.spaceAssignmentEnabled,
          personalDataRetentionDays: settings.personalDataRetentionDays,
          // 기기 타임존에 상관없이 Asia/Seoul 기준으로 최소 선택 가능 시각을 계산한다.
          minDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes,
            settings.appTimeZone,
          ),
          // 폼을 작성하는 동안 시간이 흘러 제출 시점에 최소 리드타임 아래로 내려가지
          // 않도록, 기본 선택값에는 실제 최소값보다 1분 더 여유를 둔다.
          defaultDateTimeInput: earliestSelectableInput(
            settings.reservationMinLeadMinutes + 1,
            settings.appTimeZone,
          ),
        }}
      />
    </main>
  );
}
