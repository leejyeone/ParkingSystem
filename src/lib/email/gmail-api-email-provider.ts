import { randomBytes } from 'node:crypto';

import { google } from 'googleapis';

import { getRequiredEnv } from '@/lib/env';
import {
  EmailSendError,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from '@/lib/email/email-provider';

/**
 * Gmail API 기반 이메일 발송 구현체 (SMTP 아님).
 *
 * - OAuth 2.0 Refresh Token 으로 access token 을 갱신한다.
 * - 필요한 Scope: https://www.googleapis.com/auth/gmail.send
 * - users.messages.send 로 RFC 5322 MIME 메시지를 base64url 로 전송한다.
 * - 이 파일은 서버에서만 import 되어야 하며, Client Secret / Refresh Token 은
 *   환경변수에서만 읽고 절대 클라이언트로 전달하지 않는다.
 */

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** RFC 2047 인코딩 (한글 제목/발신자명 대응) */
function encodeHeaderWord(value: string): string {
  // ASCII 만 포함하면 인코딩이 필요 없다.
  if (/^[ -~]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** RFC 5322 헤더 인젝션 방지: 개행 제거 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function buildMimeMessage(params: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  boundary?: string;
}): string {
  const boundary = params.boundary ?? `----=_Part_${randomBytes(12).toString('hex')}`;
  const from = `${encodeHeaderWord(sanitizeHeaderValue(params.fromName))} <${sanitizeHeaderValue(params.from)}>`;

  const lines = [
    `From: ${from}`,
    `To: ${sanitizeHeaderValue(params.to)}`,
    `Subject: ${encodeHeaderWord(sanitizeHeaderValue(params.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.text, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.html, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ];

  return lines.join('\r\n');
}

export function toGmailRaw(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export class GmailApiEmailProvider implements EmailProvider {
  readonly name = 'gmail-api';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const clientId = getRequiredEnv('GMAIL_CLIENT_ID');
    const clientSecret = getRequiredEnv('GMAIL_CLIENT_SECRET');
    const refreshToken = getRequiredEnv('GMAIL_REFRESH_TOKEN');
    const senderEmail = getRequiredEnv('GMAIL_SENDER_EMAIL');
    const senderName = process.env.GMAIL_SENDER_NAME?.trim() || '본사 방문관리';
    const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim() || undefined;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken, scope: GMAIL_SEND_SCOPE });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const mime = buildMimeMessage({
      from: senderEmail,
      fromName: senderName,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: toGmailRaw(mime) },
      });
      return { providerMessageId: response.data.id ?? null };
    } catch (error) {
      throw new EmailSendError(describeGmailError(error), { cause: error });
    }
  }
}

/**
 * Gmail API 오류를 사람이 읽을 수 있는 실패 사유로 변환한다.
 * 토큰/시크릿 등 비밀값이 포함되지 않도록 필요한 정보만 추출한다.
 */
export function describeGmailError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: number | string;
      message?: string;
      response?: { status?: number; data?: { error?: string; error_description?: string } };
    };
    const status = candidate.response?.status ?? candidate.code;
    const oauthError = candidate.response?.data?.error;
    const oauthDescription = candidate.response?.data?.error_description;

    if (oauthError) {
      return `Gmail API 인증 오류(${status ?? '-'}): ${oauthError}${
        oauthDescription ? ` - ${oauthDescription}` : ''
      }`;
    }
    if (candidate.message) {
      return `Gmail API 오류(${status ?? '-'}): ${candidate.message.slice(0, 300)}`;
    }
  }
  return 'Gmail API 발송 중 알 수 없는 오류가 발생했습니다.';
}
