/**
 * 이메일 공급자 추상화.
 *
 * 도메인 서비스는 이 인터페이스에만 의존한다.
 * Gmail API 구현 세부사항(googleapis, OAuth, MIME)은 gmail-api-email-provider.ts 에만 존재하며,
 * 향후 다른 공급자(SES, SendGrid 등)로 교체할 때 이 인터페이스 구현체만 추가하면 된다.
 */

export type EmailMessage = {
  /** 수신자 이메일 주소 (1건) */
  to: string;
  subject: string;
  /** HTML 본문 */
  html: string;
  /** 텍스트 본문 (HTML 을 지원하지 않는 클라이언트용) */
  text: string;
};

export type EmailSendResult = {
  /** 공급자가 반환한 메시지 ID (없으면 null) */
  providerMessageId: string | null;
};

export interface EmailProvider {
  /** 로그/디버깅용 공급자 이름 */
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** 이메일 전송 실패. reason 은 email_send_logs.fail_reason 에 저장된다. */
export class EmailSendError extends Error {
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = 'EmailSendError';
    this.reason = reason;
  }
}
