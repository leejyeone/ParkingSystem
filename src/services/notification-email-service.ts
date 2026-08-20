import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';
import { AUDIT_ACTIONS, AUDIT_TARGETS, writeAuditLog } from '@/services/audit-service';

/** 관리자 알림 이메일 수신자 관리 (SYSTEM_ADMIN 전용) */

export async function listNotificationEmails() {
  return prisma.adminNotificationEmail.findMany({
    orderBy: [{ isActive: 'desc' }, { notificationEmailId: 'asc' }],
  });
}

export type NotificationEmailInput = {
  email: string;
  recipientName?: string | null;
  receiveNewRequest: boolean;
  receiveApprovalAlert: boolean;
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
        receiveApprovalAlert: input.receiveApprovalAlert,
        isActive: input.isActive,
      },
      update: {
        recipientName: input.recipientName?.trim() || null,
        receiveNewRequest: input.receiveNewRequest,
        receiveApprovalAlert: input.receiveApprovalAlert,
        isActive: input.isActive,
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
        receiveApprovalAlert: saved.receiveApprovalAlert,
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

export async function setNotificationEmailActive(
  notificationEmailId: number,
  isActive: boolean,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminNotificationEmail.findUnique({
    where: { notificationEmailId },
  });
  if (!current) throw new NotFoundError('알림 이메일을 찾을 수 없습니다.');

  const updated = await prisma.adminNotificationEmail.update({
    where: { notificationEmailId },
    data: { isActive },
  });

  await writeAuditLog({
    actorAdminId: actor.adminUserId,
    actionType: AUDIT_ACTIONS.NOTIFICATION_EMAIL_CHANGE,
    targetType: AUDIT_TARGETS.NOTIFICATION_EMAIL,
    targetId: notificationEmailId,
    detail: { isActive },
    context: actor.requestContext,
  });

  return updated;
}
