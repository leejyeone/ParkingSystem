import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ReservationForm,
  type ReservationFormInitialValues,
} from '@/components/reservation/reservation-form';
import { Alert } from '@/components/ui/alert';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { resolveHomeHref } from '@/lib/home-link';
import { getUserSession } from '@/lib/user-session';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '방문 신청' };

export default async function NewReservationPage() {
  const settings = await getSystemSettings().catch(() => DEFAULT_SETTINGS);

  // 로그인 회원이면 저장된 정보로 폼을 자동완성한다. 비로그인이면 빈 폼 그대로.
  const [session, homeHref] = await Promise.all([getUserSession(), resolveHomeHref()]);
  const profile = session ? await getUserProfile(session.userId) : null;

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
        <p className="mt-1 text-sm text-slate-600">
          별도 가입 없이 신청할 수 있습니다. 표시된 항목(*)은 필수입니다.
        </p>
      </div>

      {!profile && (
        <div className="mb-4">
          <Alert variant="info" title="자주 방문하시나요?">
            <p>
              로그인하면 상호·성명·이메일·차량번호가 자동으로 입력되고, 내 예약을 한곳에서 볼 수
              있습니다.
            </p>
            <p className="mt-2 flex flex-wrap gap-2">
              <Link
                href="/login?redirect=%2Freservations%2Fnew"
                className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs"
              >
                로그인
              </Link>
              <Link href="/signup" className="btn btn-secondary min-h-9 px-3 py-1.5 text-xs">
                회원가입
              </Link>
            </p>
          </Alert>
        </div>
      )}

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
        }}
      />
    </main>
  );
}
