import { PolicySection } from '@/components/admin/settings-panel';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsPolicyPage() {
  const settings = await getSystemSettings();

  return <PolicySection initialSettings={settings} />;
}
