import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EmailMessage, EmailProvider, EmailSendResult } from '@/lib/email/email-provider';

/**
 * 메일 HTML을 크로미움으로 렌더링해 PNG로 찍는다. `EMAIL_PROVIDER=file`(로컬 개발 기본값)에서
 * 매 발송마다 자동으로 실행된다 — 실제 메일함이 없어도 눈으로 바로 확인할 수 있게 하기 위해서다.
 * 렌더링이 실패해도(크로미움 미설치 등) 발송 자체는 막지 않는다.
 */
async function renderEmailScreenshot(html: string, pngPath: string): Promise<void> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 800 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: pngPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

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
    // 운영 빌드에서 실수로 켜지는 것을 막는다.
    // E2E 는 프로덕션 빌드로 돌기 때문에 명시적 opt-in 을 허용한다.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FILE_EMAIL_PROVIDER !== 'true') {
      throw new Error(
        'FileEmailProvider 는 운영 환경에서 사용할 수 없습니다. ' +
          '테스트용 프로덕션 빌드라면 ALLOW_FILE_EMAIL_PROVIDER=true 를 설정하세요.',
      );
    }

    const directory = resolveMailOutboxDir();
    await mkdir(directory, { recursive: true });

    this.sequence += 1;
    const id = `${Date.now()}-${String(this.sequence).padStart(4, '0')}`;
    const filePath = path.join(directory, `${id}.json`);

    // 첨부 바이트(예: 평면도 PNG)를 그대로 쓰면 아웃박스 JSON이 커지고 읽기도 어려워지므로
    // 메타데이터(파일명/크기)만 남긴다. E2E/개발에서는 링크·텍스트 확인이 목적이라 무해하다.
    const { attachments, ...rest } = message;
    await writeFile(
      filePath,
      JSON.stringify(
        {
          id,
          savedAt: new Date().toISOString(),
          ...rest,
          attachments: attachments?.map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            cid: attachment.cid,
            size: attachment.content.length,
          })),
        },
        null,
        2,
      ),
      'utf8',
    );

    try {
      await renderEmailScreenshot(message.html, path.join(directory, `${id}.png`));
    } catch (error) {
      // 스크린샷은 눈으로 확인하기 위한 부가 기능이라, 실패해도 메일 "발송"(파일 저장) 자체는
      // 성공으로 취급한다.
      console.warn('[FileEmailProvider] 메일 스크린샷 생성 실패:', error);
    }

    return { providerMessageId: id };
  }
}
