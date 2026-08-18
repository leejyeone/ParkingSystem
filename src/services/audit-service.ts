import type { Prisma } from '@prisma/client';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { RequestContext } from '@/lib/request-context';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 감사 로그(audit_logs).
 *
 * 반드시 기록해야 하는 행위는 AUDIT_ACTIONS 에 정의한다.
 * detail_json 에는 개인정보 원문을 넣지 않고 식별자/변경 요약만 남긴다.
 */
export const AUDIT_ACTIONS = {
  RESERVATION_DETAIL_VIEW: 'RESERVATION_DETAIL_VIEW',
  RESERVATION_APPROVE: 'RESERVATION_APPROVE',
  RESERVATION_REJECT: 'RESERVATION_REJECT',
  RESERVATION_SPACE_CHANGE: 'RESERVATION_SPACE_CHANGE',
  RESERVATION_ENTRY: 'RESERVATION_ENTRY',
  RESERVATION_EXIT: 'RESERVATION_EXIT',
  RESERVATION_NO_SHOW: 'RESERVATION_NO_SHOW',
  NOTIFICATION_EMAIL_CHANGE: 'NOTIFICATION_EMAIL_CHANGE',
  PARKING_SPACE_CREATE: 'PARKING_SPACE_CREATE',
  PARKING_SPACE_UPDATE: 'PARKING_SPACE_UPDATE',
  PARKING_SPACE_DEACTIVATE: 'PARKING_SPACE_DEACTIVATE',
  PARKING_AREA_CREATE: 'PARKING_AREA_CREATE',
  PARKING_AREA_UPDATE: 'PARKING_AREA_UPDATE',
  SYSTEM_SETTING_CHANGE: 'SYSTEM_SETTING_CHANGE',
  ADMIN_USER_CREATE: 'ADMIN_USER_CREATE',
  ADMIN_USER_UPDATE: 'ADMIN_USER_UPDATE',
  ADMIN_USER_DEACTIVATE: 'ADMIN_USER_DEACTIVATE',
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGETS = {
  RESERVATION: 'RESERVATION',
  PARKING_SPACE: 'PARKING_SPACE',
  PARKING_AREA: 'PARKING_AREA',
  ADMIN_USER: 'ADMIN_USER',
  SYSTEM_SETTING: 'SYSTEM_SETTING',
  NOTIFICATION_EMAIL: 'NOTIFICATION_EMAIL',
} as const;

export type AuditTarget = (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];

export type WriteAuditLogParams = {
  actorAdminId: number | null;
  actionType: AuditAction;
  targetType: AuditTarget;
  targetId?: string | number | null;
  detail?: Prisma.InputJsonValue | null;
  context?: RequestContext;
};

export async function writeAuditLog(params: WriteAuditLogParams, db: Db = prisma): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorAdminId: params.actorAdminId,
        actionType: params.actionType,
        targetType: params.targetType,
        targetId:
          params.targetId === null || params.targetId === undefined
            ? null
            : String(params.targetId),
        detailJson: params.detail ?? undefined,
        ipAddress: params.context?.ipAddress ?? null,
        userAgent: params.context?.userAgent ?? null,
      },
    });
  } catch (error) {
    // 감사 로그 실패가 본 업무 처리를 막지 않도록 한다. 다만 반드시 서버 로그로 남긴다.
    logger.error('감사 로그 기록 실패', {
      actionType: params.actionType,
      targetType: params.targetType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
