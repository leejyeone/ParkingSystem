import type { Metadata } from 'next';

import { PolicySection } from '@/components/admin/settings-panel';
import { getSystemSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '주차장 정보' };

// 로그인 검증은 상위 레이아웃(layout.tsx)에서 이미 처리한다.
export default async function AdminSettingsPolicyPage() {
  const settings = await getSystemSettings();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">주차장 정보</h1>
        <p className="mt-1 text-sm text-slate-600">
          운영 시간, 최대 이용 시간, 주차면 배정·이중주차·입출차 관리 사용 여부 등 주차장 운영
          정책을 설정합니다. 변경 내역은 감사 로그에 기록됩니다.
        </p>
      </div>

      <PolicySection initialSettings={settings} />
    </div>
  );
}
