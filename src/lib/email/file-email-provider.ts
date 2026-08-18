import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EmailMessage, EmailProvider, EmailSendResult } from '@/lib/email/email-provider';

/**
 * 개발/E2E 전용 이메일 공급자.
 *
 * 실제로 발송하지 않고 메일 내용을 JSON 파일로 저장한다.
 * 이메일에 포함된 예약 조회 링크를 사람이 직접 확인하거나 E2E 테스트에서 읽을 때 사용한다.
 *
 * 주의: 저장 파일에는 수신자 주소와 본문이 그대로 담기므로
 *       운영 환경에서는 절대 사용하지 않는다. (EMAIL_PROVIDER=gmail 사용)
 */
export const DEFAULT_MAIL_OUTBOX_DIR = '.mail-outbox';

/**
 * 저장 위치. `MAIL_OUTBOX_DIR` 환경변수로 바꿀 수 있다.
 *
 * E2E 에서는 프로젝트 밖(OS 임시 디렉터리)을 지정한다.
 * 프로젝트 안에 파일을 쓰고 지우면 dev 서버의 파일 감시가 재컴파일을 일으켜
 * 테스트 도중 화면이 다시 그려질 수 있기 때문이다.
 */
export function resolveMailOutboxDir(): string {
  const configured = process.env.MAIL_OUTBOX_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), DEFAULT_MAIL_OUTBOX_DIR);
}

export class FileEmailProvider implements EmailProvider {
  readonly name = 'file';

  private sequence = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FileEmailProvider 는 운영 환경에서 사용할 수 없습니다.');
    }

    const directory = resolveMailOutboxDir();
    await mkdir(directory, { recursive: true });

    this.sequence += 1;
    const id = `${Date.now()}-${String(this.sequence).padStart(4, '0')}`;
    const filePath = path.join(directory, `${id}.json`);

    await writeFile(
      filePath,
      JSON.stringify({ id, savedAt: new Date().toISOString(), ...message }, null, 2),
      'utf8',
    );

    return { providerMessageId: id };
  }
}
