import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { UserDeleteAccountPanel } from '@/components/user/user-delete-account-panel';
import { UserProfilePanel } from '@/components/user/user-profile-panel';
import { requireUserPage } from '@/lib/user-page-guard';
import { getUserProfile } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

export default async function MyPage() {
  const session = await requireUserPage('/mypage');

  const profile = await getUserProfile(session.userId);

  if (!profile) {
    redirect('/login?redirect=%2Fmypage');
  }

  return (
    <main className="app-container space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
        <p className="mt-1 text-sm text-slate-600">
          {profile.companyOrBranchName} {profile.name}님, 안녕하세요.
        </p>
      </div>

      {/* <Link href="/reservations/new" className="btn btn-primary btn-lg w-full">
        방문 신청하기
      </Link> */}

      <UserProfilePanel
        profile={{
          email: profile.email,
          name: profile.name,
          companyOrBranchName: profile.companyOrBranchName,
          vehicleNo: profile.vehicleNo,
          hostEmployeeName: profile.hostEmployeeName,
          hostEmployeeDepartmentName: profile.hostEmployeeDepartmentName,
        }}
      />

      <UserDeleteAccountPanel />
    </main>
  );
}
