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

/**
 * 수신자를 목록에서 지운다.
 *
 * 이 테이블을 참조하는 다른 테이블이 없어 실제로 삭제해도 이력이 깨지지 않는다.
 * 발송 기록은 email_send_logs 에 수신 주소가 그대로 남으므로 추적에도 문제가 없다.
 */
export async function deleteNotificationEmail(
  notificationEmailId: number,
  actor: { adminUserId: number; requestContext?: RequestContext },
) {
  const current = await prisma.adminNotificationEmail.findUnique({
    where: { notificationEmailId },
  });
  if (!current) throw new NotFoundError('알림 이메일을 찾을 수 없습니다.');

  await prisma.adminNotificationEmail.delete({ where: { notificationEmailId } });

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
