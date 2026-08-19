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
  RESERVATION_LIST_VIEW: 'RESERVATION_LIST_VIEW',
  RESERVATION_DETAIL_VIEW: 'RESERVATION_DETAIL_VIEW',
  RESERVATION_UPDATE: 'RESERVATION_UPDATE',
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
  AUDIT_LOG_VIEW: 'AUDIT_LOG_VIEW',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * 개인정보 "열람" 계열 액션.
 *
 * 접속기록 자체는 반드시 남겨야 하지만, 같은 관리자가 같은 대상을 연속으로 새로고침할 때마다
 * 행을 만들면 감사 로그가 조회 기록으로 도배되어 오히려 점검이 어려워진다.
 * 아래 액션에 한해 짧은 시간 창 안의 동일 열람은 한 건으로 묶는다.
 * 승인/반려/설정 변경 등 상태를 바꾸는 행위는 절대 묶지 않는다.
 */
export const VIEW_AUDIT_ACTIONS: readonly AuditAction[] = [
  'RESERVATION_LIST_VIEW',
  'RESERVATION_DETAIL_VIEW',
  'AUDIT_LOG_VIEW',
];

const VIEW_DEDUPE_WINDOW_MINUTES = 5;

const DEDUPED_VIEW_ACTIONS = new Set<AuditAction>(VIEW_AUDIT_ACTIONS);

export const AUDIT_TARGETS = {
  RESERVATION: 'RESERVATION',
  AUDIT_LOG: 'AUDIT_LOG',
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
  const targetId =
    params.targetId === null || params.targetId === undefined ? null : String(params.targetId);

  if (await isRecentDuplicateView(params, targetId, db)) return;

  try {
    await db.auditLog.create({
      data: {
        actorAdminId: params.actorAdminId,
        actionType: params.actionType,
        targetType: params.targetType,
        targetId,
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

/**
 * 최근 VIEW_DEDUPE_WINDOW_MINUTES 분 안에 동일한 열람 기록이 있는지 확인한다.
 *
 * 확인 쿼리가 실패하면 "중복이 아니다"로 간주해 기록을 남긴다.
 * 접속기록은 누락되는 것보다 중복되는 편이 안전하기 때문이다.
 */
async function isRecentDuplicateView(
  params: WriteAuditLogParams,
  targetId: string | null,
  db: Db,
): Promise<boolean> {
  if (!DEDUPED_VIEW_ACTIONS.has(params.actionType)) return false;
  if (params.actorAdminId === null) return false;

  const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MINUTES * 60_000);

  try {
    const recent = await db.auditLog.findFirst({
      where: {
        actorAdminId: params.actorAdminId,
        actionType: params.actionType,
        targetId,
        createdAt: { gte: since },
      },
      select: { auditLogId: true },
    });
    return recent !== null;
  } catch {
    return false;
  }
}
