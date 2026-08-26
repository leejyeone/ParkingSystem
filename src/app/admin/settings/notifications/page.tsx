import { NotificationSection } from '@/components/admin/settings-panel';
import { listNotificationEmails } from '@/services/notification-email-service';

export const dynamic = 'force-dynamic';

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsNotificationsPage() {
  const notificationEmails = await listNotificationEmails();

  return <NotificationSection emails={notificationEmails} />;
}
