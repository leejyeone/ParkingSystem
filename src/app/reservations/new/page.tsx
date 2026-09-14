import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ReservationForm,
  type ReservationFormInitialValues,
} from '@/components/reservation/reservation-form';
import { Alert } from '@/components/ui/alert';
import { DEFAULT_SETTINGS } from '@/domain/system-settings';
import { earliestSelectableInput } from '@/lib/datetime';
import { getSystemSettings } from '@/services/settings-service';
import { getUserProfile } from '@/services/user-auth-service';
import { requireUserPage } from '@/lib/user-page-guard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '방문 신청' };

export default async function NewReservationPage() {
  // 방문 신청은 회원가입·로그인이 필수다. 비로그인이면 로그인 화면으로 보내고,
  // 로그인 후 이 페이지로 그대로 돌아온다(safeUserRedirect 허용 목록에 이미 포함).
  const session = await requireUserPage('/reservations/new');
  const [settings, profile] = await Promise.all([
    getSystemSettings().catch(() => DEFAULT_SETTINGS),
    getUserProfile(session.userId),
  ]);

  const headerBlock = (
    <div className="mb-4">
      <h1 className="text-xl font-black text-slate-900 sm:text-2xl">방문 신청</h1>
    </div>
  );

  // 차량번호·담당자를 아직 등록하지 않은 계정(회원가입 필수화 이전 가입자 등)은 신청
  // 폼 자체를 보여주지 않고 마이페이지에서 먼저 채우도록 안내한다.
  if (!profile || !profile.vehicleNo || !profile.hostEmployeeUserId) {
    return (
      <main className="app-container pb-4">
        {headerBlock}
        <Alert variant="info" title="신청 전에 정보를 등록해 주세요">
          <p>방문 신청은 차량번호와 당사 담당자 등록이 필요합니다.</p>
          <p className="mt-2">
            <Link href="/mypage" className="btn btn-primary min-h-9 px-3 py-1.5 text-xs">
              마이페이지로 이동
            </Link>
          </p>
        </Alert>
      </main>
    );
  }

  const initialValues: ReservationFormInitialValues = {
    companyOrBranchName: profile.companyOrBranchName,
    requesterName: profile.name,
    requesterEmail: profile.email,
    vehicleNo: profile.vehicleNo,
    hostEmployee: {
      employeeUserId: profile.hostEmployeeUserId,
      label: `${profile.hostEmployeeName} (${profile.hostEmployeeDepartmentName})`,
    },
  };

  return (
    <main className="app-container pb-4">
      {headerBlock}

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
