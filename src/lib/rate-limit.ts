import { TooManyRequestsError } from '@/lib/errors';

/**
 * 매우 단순한 in-memory 고정 윈도우 레이트 리미터.
 *
 * 주의: 프로세스 단위로만 동작하므로 다중 인스턴스 환경에서는
 * Redis 등 공유 저장소 기반 구현으로 교체해야 한다. (README 운영 점검 목록 참고)
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}): void {
  const now = Date.now();
  const bucket = buckets.get(params.key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(params.key, { count: 1, resetAt: now + params.windowMs });
    cleanup(now);
    return;
  }

  bucket.count += 1;
  if (bucket.count > params.limit) {
    throw new TooManyRequestsError(
      params.message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
}

function cleanup(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** 테스트용 초기화 */
export function resetRateLimits(): void {
  buckets.clear();
}
