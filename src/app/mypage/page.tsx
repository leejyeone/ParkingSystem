import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { UserDeleteAccountPanel } from '@/components/user/user-delete-account-panel';
import { UserLogoutButton } from '@/components/user/user-logout-button';
import { UserProfilePanel } from '@/components/user/user-profile-panel';
import { resolveHomeHref } from '@/lib/home-link';
import { requireUserPage } from '@/lib/user-page-guard';
import { getUserProfile } from '@/services/user-auth-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '마이페이지' };

export default async function MyPage() {
  const session = await requireUserPage('/mypage');
  const homeHref = await resolveHomeHref();

  const profile = await getUserProfile(session.userId);

  if (!profile) {
    redirect('/login?redirect=%2Fmypage');
  }

  return (
    <main className="app-container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={homeHref} className="text-brand-700 text-sm font-semibold">
            ← 처음으로
          </Link>
          <h1 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">마이페이지</h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile.companyOrBranchName} {profile.name}님, 안녕하세요.
          </p>
        </div>
        <UserLogoutButton />
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
        }}
      />

      <UserDeleteAccountPanel />
    </main>
  );
}
