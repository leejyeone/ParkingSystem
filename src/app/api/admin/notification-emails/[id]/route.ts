import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { deleteNotificationEmail } from '@/services/notification-email-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/notification-emails/[id] — 알림 수신자 삭제
 *
 * 등록/수정은 기존 PUT /api/admin/settings 의 notificationEmail 경로를 그대로 쓴다.
 * 그쪽은 이메일 주소를 키로 upsert 하므로, id 가 필요한 삭제만 여기에 둔다.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireActiveAdmin();
    const { id } = await context.params;

    const result = await deleteNotificationEmail(parseNumericId(id, '알림 이메일 ID'), {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
