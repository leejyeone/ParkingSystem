import type { NextRequest } from 'next/server';

import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { clearAdminSessionCookie, getAdminSession } from '@/lib/session';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/auth/logout */
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    await clearAdminSessionCookie();

    if (session) {
      await writeAuditLog({
        actorAdminId: session.adminUserId,
        actionType: AUDIT_ACTIONS.ADMIN_LOGOUT,
        targetType: AUDIT_TARGETS.ADMIN_USER,
        targetId: session.adminUserId,
        context: getRequestContext(request.headers),
      });
    }

    return apiSuccess({ loggedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
