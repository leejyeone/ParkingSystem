import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { ValidationError } from '@/lib/errors';
import { getRequestContext } from '@/lib/request-context';
import { notificationEmailSchema, systemSettingsSchema } from '@/lib/validation/admin-schema';
import { requireSystemAdmin } from '@/services/admin-auth-service';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';
import {
  listNotificationEmails,
  upsertNotificationEmail,
} from '@/services/notification-email-service';
import { getSystemSettings, updateSystemSettings } from '@/services/settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/settings — 시스템 설정 + 관리자 알림 이메일 목록
 * SYSTEM_ADMIN 만 접근할 수 있다. PARKING_ADMIN 은 403 을 받는다.
 */
export async function GET() {
  try {
    await requireSystemAdmin();
    const [settings, notificationEmails] = await Promise.all([
      getSystemSettings(),
      listNotificationEmails(),
    ]);
    return apiSuccess({ settings, notificationEmails });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/admin/settings
 *
 * 요청 본문은 아래 두 키를 모두, 또는 하나만 포함할 수 있다.
 *   { "settings": {...} }            → 시스템 설정 저장
 *   { "notificationEmail": {...} }   → 관리자 알림 이메일 등록/수정
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const requestContext = getRequestContext(request.headers);

    const hasSettings = body.settings !== undefined && body.settings !== null;
    const hasNotificationEmail =
      body.notificationEmail !== undefined && body.notificationEmail !== null;

    if (!hasSettings && !hasNotificationEmail) {
      throw new ValidationError('변경할 설정 값이 없습니다.');
    }

    if (hasSettings) {
      const before = await getSystemSettings();
      const settingsPayload = systemSettingsSchema.parse(body.settings);
      const after = await updateSystemSettings(settingsPayload, session.adminUserId);

      await writeAuditLog({
        actorAdminId: session.adminUserId,
        actionType: AUDIT_ACTIONS.SYSTEM_SETTING_CHANGE,
        targetType: AUDIT_TARGETS.SYSTEM_SETTING,
        targetId: 'ALL',
        detail: { before, after },
        context: requestContext,
      });
    }

    if (hasNotificationEmail) {
      const notificationPayload = notificationEmailSchema.parse(body.notificationEmail);
      await upsertNotificationEmail(notificationPayload, {
        adminUserId: session.adminUserId,
        requestContext,
      });
    }

    const [settings, notificationEmails] = await Promise.all([
      getSystemSettings(),
      listNotificationEmails(),
    ]);
    return apiSuccess({ settings, notificationEmails });
  } catch (error) {
    return handleApiError(error);
  }
}
