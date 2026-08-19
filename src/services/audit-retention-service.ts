import { Prisma } from '@prisma/client';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/**
 * 감사 로그 보관 기간 정리.
 *
 * 「개인정보의 안전성 확보조치 기준」 제8조에 따라 접속기록은 최소 1년 이상 보관해야 한다.
 * 1년은 하한선이지 무제한 보관하라는 뜻이 아니므로, 보관 기간이 지난 기록은 삭제한다.
 */

/** 법정 최소 보관 기간(일). 이 값 아래로 내려가면 기준 미달이다. */
export const MINIMUM_RETENTION_DAYS = 365;

/** 한 번의 DELETE 로 지우는 행 수. 대량 삭제 시 락이 길어지는 것을 막는다. */
const DELETE_BATCH_SIZE = 1000;

/** 무한 루프 방지용 상한. 한 번 실행에서 최대 100 * 1000 = 10만 건까지 정리한다. */
const MAX_BATCHES = 100;

export async function purgeExpiredAuditLogs(
  now: Date,
  retentionDays: number,
): Promise<{ deletedCount: number; cutoff: Date; truncated: boolean }> {
  const effectiveDays = Math.max(1, Math.floor(retentionDays));
  const cutoff = new Date(now.getTime() - effectiveDays * 24 * 60 * 60 * 1000);

  let deletedCount = 0;
  let truncated = true;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const affected = await prisma.$executeRaw(
      Prisma.sql`DELETE FROM audit_logs WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH_SIZE}`,
    );
    deletedCount += affected;

    if (affected < DELETE_BATCH_SIZE) {
      truncated = false;
      break;
    }
  }

  if (truncated) {
    // 상한에 걸렸다는 것은 아직 지울 기록이 남았다는 뜻이다. 다음 실행에서 이어서 지운다.
    logger.warn('감사 로그 정리 상한 도달. 다음 실행에서 계속 정리합니다.', { deletedCount });
  }

  return { deletedCount, cutoff, truncated };
}
