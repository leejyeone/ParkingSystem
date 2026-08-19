import type { Metadata } from 'next';

import { SettingsPanel } from '@/components/admin/settings-panel';
import { requireSystemAdminPage } from '@/lib/admin-page-guard';
import { listAdminUsers } from '@/services/admin-user-service';
import { listNotificationEmails } from '@/services/notification-email-service';
import { listParkingAreas, listParkingSpaces } from '@/services/parking-space-service';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '시스템 설정' };

/** SYSTEM_ADMIN 전용 시스템 설정 화면 */
export default async function AdminSettingsPage() {
  await requireSystemAdminPage('/admin/settings');

  const [settings, notificationEmails, areas, spaces, adminUsers] = await Promise.all([
    getSystemSettings(),
    listNotificationEmails(),
    listParkingAreas(),
    listParkingSpaces({ includeInactive: true }),
    listAdminUsers(),
  ]);

  return (
    <main className="app-container-wide space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">시스템 설정</h1>
        <p className="mt-1 text-sm text-slate-600">
          시스템 관리자만 접근할 수 있습니다. 설정 변경 내역은 감사 로그에 기록됩니다.
        </p>
      </div>

      <SettingsPanel
        initialSettings={settings}
        notificationEmails={notificationEmails}
        areas={areas.map((area) => ({
          ...area,
          mapImageUpdatedAt: area.mapImageUpdatedAt ? area.mapImageUpdatedAt.toISOString() : null,
        }))}
        spaces={spaces}
        adminUsers={adminUsers.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        }))}
      />
    </main>
  );
}
