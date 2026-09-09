import type { Metadata } from 'next';

import { SiteUserPanel } from '@/components/admin/site-user-panel';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { listSiteUsers } from '@/services/site-user-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '회원 계정 관리' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다. 이 화면은 그중에서도
// 시스템 관리자만 볼 수 있다.
export default async function AdminUsersMembersPage() {
  await requireSystemAdminPage('/admin/users/members');
  const siteUsers = await listSiteUsers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">회원 계정 관리</h1>
        <p className="text-ink-muted mt-1 text-sm">
          이메일·비밀번호로 로그인하는 회원(방문객) 계정입니다. 비밀번호를 잊었다는 문의를
          받으면 [비밀번호 재설정]으로 처리해 주세요.
        </p>
      </div>

      <SiteUserPanel
        siteUsers={siteUsers.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
