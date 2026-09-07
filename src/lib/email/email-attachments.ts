import type { EmailAttachment } from '@/lib/email/email-provider';

/**
 * 첨부파일을 EmailSendLog.attachmentsJson 에 저장/복원하기 위한 직렬화.
 *
 * 재발송(resendFailedEmail)이 원래 발송된 내용을 그대로 다시 보내야 하므로
 * (예약이 그 사이 바뀌었어도), 첨부 바이트 자체를 DB에 함께 저장해 둔다.
 */
export type StoredEmailAttachment = {
  filename: string;
  contentType: string;
  cid: string;
  contentBase64: string;
};

export function serializeAttachments(
  attachments?: EmailAttachment[],
): StoredEmailAttachment[] | null {
  if (!attachments || attachments.length === 0) return null;
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    cid: attachment.cid,
    contentBase64: attachment.content.toString('base64'),
  }));
}

export function deserializeAttachments(stored: unknown): EmailAttachment[] | undefined {
  if (!Array.isArray(stored)) return undefined;
  const attachments = stored
    .filter(
      (item): item is StoredEmailAttachment =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as StoredEmailAttachment).contentBase64 === 'string',
    )
    .map((item) => ({
      filename: item.filename,
      contentType: item.contentType,
      cid: item.cid,
      content: Buffer.from(item.contentBase64, 'base64'),
    }));
  return attachments.length > 0 ? attachments : undefined;
}
