/**
 * Next.js instrumentation 훅. 서버 프로세스가 뜰 때 한 번 실행된다.
 *
 * 내장 스케줄러를 여기서 시작한다. Prisma 와 파일 시스템을 쓰므로
 * Node.js 런타임에서만 동작해야 하고, 빌드 단계에서는 돌지 않아야 한다.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { startScheduler } = await import('@/lib/scheduler');
  startScheduler();
}
