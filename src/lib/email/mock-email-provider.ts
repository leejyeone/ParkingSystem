import type { EmailMessage, EmailProvider, EmailSendResult } from '@/lib/email/email-provider';
import { EmailSendError } from '@/lib/email/email-provider';
import { logger } from '@/lib/logger';

/**
 * 테스트/E2E 용 이메일 공급자.
 * 실제로 발송하지 않고 메모리에 적재하므로 발송 내용을 검증할 수 있다.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  readonly sentMessages: EmailMessage[] = [];

  /** true 로 두면 모든 발송이 실패한다. (실패 로깅/재시도 테스트용) */
  shouldFail = false;

  failReason = '테스트용 강제 실패';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.shouldFail) {
      throw new EmailSendError(this.failReason);
    }
    this.sentMessages.push(message);
    return { providerMessageId: `mock-${this.sentMessages.length}` };
  }

  reset(): void {
    this.sentMessages.length = 0;
    this.shouldFail = false;
  }

  findByRecipient(email: string): EmailMessage[] {
    return this.sentMessages.filter((message) => message.to === email);
  }
}

/**
 * 로컬 개발용 공급자. 실제 발송 없이 수신자/제목만 콘솔에 남긴다.
 * 본문에는 개인정보가 포함되므로 출력하지 않는다.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info('[EMAIL:log] 이메일 발송(모의)', { to: message.to, subject: message.subject });
    return { providerMessageId: null };
  }
}
