import { randomBytes } from 'node:crypto';

import { google } from 'googleapis';

import { getRequiredEnv } from '@/lib/env';
import {
  EmailSendError,
  type EmailAttachment,
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

/** base64 본문은 RFC 2045 상 76자마다 줄바꿈해야 한다(안 하면 일부 서버가 거부한다). */
function chunkBase64(base64: string): string {
  return base64.replace(/(.{76})/g, '$1\r\n');
}

export function buildMimeMessage(params: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** multipart/alternative(text+html) 경계값. 첨부가 있으면 안쪽 파트로 쓰인다. */
  boundary?: string;
  /** multipart/related 경계값(첨부가 있을 때만 바깥 파트로 쓰인다). */
  relatedBoundary?: string;
}): string {
  const boundary = params.boundary ?? `----=_Part_Alt_${randomBytes(12).toString('hex')}`;
  const from = `${encodeHeaderWord(sanitizeHeaderValue(params.fromName))} <${sanitizeHeaderValue(params.from)}>`;
  const attachments = params.attachments ?? [];

  const headerLines = [
    `From: ${from}`,
    `To: ${sanitizeHeaderValue(params.to)}`,
    `Subject: ${encodeHeaderWord(sanitizeHeaderValue(params.subject))}`,
    'MIME-Version: 1.0',
  ];

  const alternativePart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(params.text, 'utf8').toString('base64')),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(params.html, 'utf8').toString('base64')),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  if (attachments.length === 0) {
    return [
      ...headerLines,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      alternativePart,
      '',
    ].join('\r\n');
  }

  /*
   * 첨부(인라인 이미지 등)가 있으면 multipart/related 로 감싸고, 그 안에 기존
   * multipart/alternative(text+html) 와 첨부 파트를 나란히 둔다. HTML 본문은
   * cid:<attachment.cid> 로 이미지를 참조한다.
   */
  const relatedBoundary = params.relatedBoundary ?? `----=_Part_Rel_${randomBytes(12).toString('hex')}`;
  const attachmentParts = attachments.map((attachment) =>
    [
      `--${relatedBoundary}`,
      `Content-Type: ${attachment.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${attachment.cid}>`,
      `Content-Disposition: inline; filename="${sanitizeHeaderValue(attachment.filename)}"`,
      '',
      chunkBase64(attachment.content.toString('base64')),
    ].join('\r\n'),
  );

  return [
    ...headerLines,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    '',
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    alternativePart,
    '',
    ...attachmentParts,
    `--${relatedBoundary}--`,
    '',
  ].join('\r\n');
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
      attachments: message.attachments,
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
