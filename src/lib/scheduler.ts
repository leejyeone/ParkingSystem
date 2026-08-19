import { isInternalSchedulerEnabled, getSchedulerIntervalSeconds } from '@/lib/env';
import { logger } from '@/lib/logger';
import { runExitReminderJob } from '@/services/exit-reminder-service';

/**
 * 앱 내장 스케줄러.
 *
 * 출차 예정 알림은 사용자 동작이 아니라 시간이 되면 나가야 하는 메일이라
 * 이를 부를 주체가 필요하다. 별도 cron 등록 없이 서버가 뜨면 스스로 돌도록
 * instrumentation 훅에서 이 모듈을 시작한다.
 *
 * 플랫폼 스케줄러(Vercel Cron, Windows 작업 스케줄러 등)로 /api/cron/* 을
 * 직접 호출하는 환경이라면 INTERNAL_SCHEDULER_ENABLED=false 로 끄면 된다.
 *
 * 중복 실행 안전성
 *  - 인스턴스가 여러 개여도 email_send_logs.dedupe_key UNIQUE 제약이
 *    같은 예약에 두 번 발송되는 것을 막는다.
 *  - 한 프로세스 안에서는 아래 isRunning 플래그로 실행이 겹치지 않게 한다.
 */

/** 개발 모드의 모듈 리로드로 타이머가 중복 등록되지 않도록 전역에 표시해 둔다. */
const STARTED_FLAG = Symbol.for('synopex.parking.scheduler.started');

type GlobalWithFlag = typeof globalThis & { [STARTED_FLAG]?: boolean };

let isRunning = false;

async function runExitReminders(): Promise<void> {
  // 앞선 실행이 아직 끝나지 않았다면 이번 주기는 건너뛴다.
  if (isRunning) return;
  isRunning = true;

  try {
    // 발송 결과 로그는 작업 쪽에서 남긴다. 대상이 없는 주기는 조용히 지나간다.
    await runExitReminderJob();
  } catch (error) {
    // 스케줄러가 죽으면 이후 알림이 전부 멈추므로 예외를 삼키고 다음 주기를 기다린다.
    logger.error('출차 예정 알림 스케줄러 실패', {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
}

/** 서버 기동 시 1회 호출한다. 두 번 이상 불러도 타이머는 하나만 만들어진다. */
export function startScheduler(): void {
  const globalWithFlag = globalThis as GlobalWithFlag;
  if (globalWithFlag[STARTED_FLAG]) return;

  if (!isInternalSchedulerEnabled()) {
    logger.info('내장 스케줄러가 비활성화되어 있습니다. (INTERNAL_SCHEDULER_ENABLED=false)');
    return;
  }

  globalWithFlag[STARTED_FLAG] = true;

  const intervalSeconds = getSchedulerIntervalSeconds();
  const timer = setInterval(() => {
    void runExitReminders();
  }, intervalSeconds * 1_000);

  // 타이머 때문에 프로세스 종료가 늦어지지 않게 한다.
  timer.unref();

  logger.info('내장 스케줄러 시작', { intervalSeconds, jobs: ['exit-reminders'] });
}
