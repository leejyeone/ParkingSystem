import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 관리자 알림 이메일 수신자 관리 */

export async function listNotificationEmails() {
  return prisma.adminNotificationEmail.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { notificationEmailId: 'asc' }],
  });
}

export type NotificationEmailInput = {
  email: string;
  recipientName?: string | null;
  receiveNewRequest: boolean;
  receiveChangeAlert: boolean;
  isActive: boolean;
};

export async function upsertNotificationEmail(
  input: NotificationEmailInput,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const email = input.email.trim().toLowerCase();

  try {
    const saved = await prisma.adminNotificationEmail.upsert({
      where: { email },
      create: {
        email,
        recipientName: input.recipientName?.trim() || null,
        receiveNewRequest: input.receiveNewRequest,
        receiveChangeAlert: input.receiveChangeAlert,
        isActive: input.isActive,
      },
      update: {
        recipientName: input.recipientName?.trim() || null,
        receiveNewRequest: input.receiveNewRequest,
        receiveChangeAlert: input.receiveChangeAlert,
        isActive: input.isActive,
        // 예전에 삭제(소프트 삭제)된 주소를 같은 이메일로 다시 등록하면 새 행을 만드는
        // 대신 유니크 제약에 걸린 기존 행을 되살린다.
        deletedAt: null,
      },
    });

    await writeAuditLog({
      actorAdminId: actor.adminUserId,
      actionType: AUDIT_ACTIONS.NOTIFICATION_EMAIL_CHANGE,
      targetType: AUDIT_TARGETS.NOTIFICATION_EMAIL,
      targetId: saved.notificationEmailId,
      detail: {
        // 감사 로그에도 수신자 전체 주소는 남기지 않는다.
        domain: email.split('@')[1] ?? null,
        isActive: saved.isActive,
        receiveNewRequest: saved.receiveNewRequest,
        receiveChangeAlert: saved.receiveChangeAlert,
      },
      context: actor.requestContext,
    });

    return saved;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('이미 등록된 알림 이메일입니다.', 'DUPLICATE_NOTIFICATION_EMAIL');
    }
    throw error;
  }
}

/**
 * 수신자를 목록에서 지운다. (소프트 삭제 — deletedAt 만 채우고 행은 남긴다)
 *
 * DB 는 실제로 지우지 않는다. 삭제되면 `isActive`("알림 수신 여부" 토글)도 항상 같이
 * 꺼진다 — 삭제인데 `isActive`가 켜진 채로 남으면, `deletedAt`을 안 보고 `isActive`만
 * 확인하는 조회가 생길 때마다 삭제된 수신자가 계속 알림을 받는 것처럼 새어 나갈 수 있다.
 */
export async function deleteNotificationEmail(
  notificationEmailId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminNotificationEmail.findUnique({
    where: { notificationEmailId },
  });
  if (!current || current.deletedAt) throw new NotFoundError('알림 이메일을 찾을 수 없습니다.');

  await prisma.adminNotificationEmail.update({
    where: { notificationEmailId },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.NOTIFICATION_EMAIL_DELETE,
    targetType: AUDIT_TARGETS.NOTIFICATION_EMAIL,
    targetId: notificationEmailId,
    // 감사 로그에도 수신자 전체 주소는 남기지 않는다.
    detail: { domain: current.email.split('@')[1] ?? null },
    context: actor.requestContext,
  });

  return { notificationEmailId };
}
