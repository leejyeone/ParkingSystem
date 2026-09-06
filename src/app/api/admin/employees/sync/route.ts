import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveSystemAdmin } from '@/services/admin-auth-service';
import { applyUniportalSync, buildUniportalSyncPlan } from '@/services/uniportal-sync-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** 800명 규모 조회 + 갱신이라 기본 시간제한으로는 모자란다. */
export const maxDuration = 300;

/**
 * POST /api/admin/employees/sync — 그룹웨어(유니포탈) 직원 명부 동기화.
 * 시스템 관리자 전용.
 *
 * body { mode: "preview" }  변경 예정 내역만 계산해서 돌려준다. DB 를 건드리지 않는다.
 * body { mode: "apply"   }  실제로 반영한다.
 *
 * apply 는 화면에서 받은 미리보기 결과를 쓰지 않고 서버에서 다시 계산한다. 미리보기를 띄워 둔
 * 사이에 명부가 바뀌었을 수 있고, 화면에서 온 값을 신뢰하면 조작될 여지가 생기기 때문이다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveSystemAdmin();
    const body = (await readJsonBody(request).catch(() => ({}))) as { mode?: string };

    if (body.mode === 'apply') {
      const result = await applyUniportalSync({
        adminUserId: session.adminUserId,
        requestContext: getRequestContext(request.headers),
      });
      return apiSuccess({ mode: 'apply', ...result });
    }

    return apiSuccess({ mode: 'preview', ...(await buildUniportalSyncPlan()) });
  } catch (error) {
    return handleApiError(error);
  }
}
