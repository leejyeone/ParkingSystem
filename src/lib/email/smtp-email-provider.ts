import nodemailer, { type Transporter } from 'nodemailer';

import {
  EmailSendError,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from '@/lib/email/email-provider';
import { getNumberEnv, getOptionalEnv, getRequiredEnv } from '@/lib/env';

/**
 * 사내망 SMTP 서버(JAMES) 기반 이메일 발송 구현체.
 *
 * 아직 검증 중인 경로다 — 검증되면 Gmail(`gmail-api-email-provider.ts`)을 대체할
 * 예정이지만, 그 전까지는 `EMAIL_PROVIDER` 환경변수로 어느 쪽을 쓸지 고를 뿐 서로
 * 완전히 독립적이다. 이 파일이 필요 없어지면 이 파일과
 * `email-provider-factory.ts` 의 `smtp` 분기만 지우면 된다.
 *
 * 사내망 SMTP 는 별도 인증 없이 여는 경우도 있어, SMTP_USER/SMTP_PASS 를 둘 다
 * 비워두면 인증 없이 연결한다. 연결마다 필요한 값은 Gmail 구현체와 동일하게
 * `send()` 호출 시점에 그때그때 읽는다(지연 평가, `src/lib/env.ts` 관례).
 */

/**
 * transporter 를 모듈 스코프에 캐싱해 재사용한다. 원래는 발송마다 새로
 * `createTransport`해서 TCP connect + TLS 핸드셰이크 + AUTH를 매번 반복했는데,
 * `pool: true`로 커넥션을 유지하는 transporter 자체를 재사용하면 두 번째 발송부터는
 * 이 과정을 건너뛴다. 설정값(호스트/포트/계정)이 바뀌면 새로 만든다 — 런타임에
 * SMTP_* 환경변수가 바뀌는 일은 거의 없지만, 테스트 등에서 값을 바꿔 가며 여러 번
 * 만드는 경우까지 대비한 것이다.
 */
let cachedTransporter: Transporter | null = null;
let cachedConfigKey: string | null = null;

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const host = getRequiredEnv('SMTP_HOST');
    const port = getNumberEnv('SMTP_PORT', 25);
    const user = getOptionalEnv('SMTP_USER');
    const pass = getOptionalEnv('SMTP_PASS');
    const senderEmail = getRequiredEnv('SMTP_FROM_EMAIL');
    const senderName = getOptionalEnv('SMTP_FROM_NAME') ?? '본사 방문관리';
    const secure = (getOptionalEnv('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';
    const requireTLS = (getOptionalEnv('SMTP_REQUIRE_TLS') ?? 'false').toLowerCase() === 'true';
    const rejectUnauthorized =
      (getOptionalEnv('SMTP_TLS_REJECT_UNAUTHORIZED') ?? 'true').toLowerCase() !== 'false';
    const connectionTimeout = getNumberEnv('SMTP_CONNECTION_TIMEOUT_MS', 10000);

    const configKey = JSON.stringify({
      host,
      port,
      user,
      pass,
      secure,
      requireTLS,
      rejectUnauthorized,
      connectionTimeout,
    });

    if (!cachedTransporter || cachedConfigKey !== configKey) {
      cachedTransporter?.close();
      cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS,
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        tls: { rejectUnauthorized },
      });
      cachedConfigKey = configKey;
    }
    const transporter = cachedTransporter;

    try {
      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          cid: attachment.cid,
        })),
      });
      return { providerMessageId: info.messageId ?? null };
    } catch (error) {
      throw new EmailSendError(describeSmtpError(error), { cause: error });
    }
  }
}

/**
 * SMTP 오류를 사람이 읽을 수 있는 실패 사유로 변환한다.
 * 계정/비밀번호 등 비밀값이 포함되지 않도록 서버 응답 코드/문구만 추출한다.
 */
export function describeSmtpError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: string;
      responseCode?: number;
      response?: string;
      message?: string;
    };
    if (candidate.responseCode || candidate.response) {
      return `SMTP 오류(${candidate.responseCode ?? candidate.code ?? '-'}): ${(
        candidate.response ??
        candidate.message ??
        ''
      ).slice(0, 300)}`;
    }
    if (candidate.message) {
      return `SMTP 오류(${candidate.code ?? '-'}): ${candidate.message.slice(0, 300)}`;
    }
  }
  return 'SMTP 발송 중 알 수 없는 오류가 발생했습니다.';
}
