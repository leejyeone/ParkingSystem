import type { Metadata } from 'next';

import { NotificationSection } from '@/components/admin/settings-panel';
import { listNotificationEmails } from '@/services/notification-email-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '관리자 이메일' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminUsersNotificationsPage() {
  const notificationEmails = await listNotificationEmails();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-black sm:text-2xl">관리자 이메일</h1>
        <p className="text-ink-muted mt-1 text-sm">
          예약 알림 메일을 받을 관리자 이메일 주소를 등록·수정합니다. 변경 내역은 감사 로그에
          기록됩니다.
        </p>
      </div>

      <NotificationSection emails={notificationEmails} />
    </div>
  );
}
