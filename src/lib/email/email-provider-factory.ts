import { getEmailProviderKind } from '@/lib/env';
import type { EmailProvider } from '@/lib/email/email-provider';
import { LogEmailProvider, MockEmailProvider } from '@/lib/email/mock-email-provider';

/**
 * EMAIL_PROVIDER 환경변수에 따라 공급자를 선택한다.
 *  - gmail : Gmail API (운영)
 *  - smtp  : 사내망 SMTP 서버(JAMES) 로 직접 발송 (검증 중 — 검증되면 gmail 대체 예정)
 *  - mock  : 메모리 적재 (단위/통합 테스트)
 *  - file  : .mail-outbox 디렉터리에 JSON 저장 (로컬 확인 / E2E)
 *  - log   : 콘솔에 수신자·제목만 출력 (로컬 개발 기본값)
 *
 * gmail / smtp / file 구현체는 동적 import 로 로드한다.
 * 테스트 환경에서 googleapis·nodemailer·fs 를 불필요하게 로드하지 않기 위해서다.
 */

let overrideProvider: EmailProvider | null = null;
let cachedProvider: EmailProvider | null = null;

/** 테스트에서 공급자를 강제로 주입한다. */
export function setEmailProviderForTesting(provider: EmailProvider | null): void {
  overrideProvider = provider;
  cachedProvider = null;
}

/** 테스트용 MockEmailProvider 를 생성해 주입하고 반환한다. */
export function installMockEmailProvider(): MockEmailProvider {
  const provider = new MockEmailProvider();
  setEmailProviderForTesting(provider);
  return provider;
}

export async function getEmailProvider(): Promise<EmailProvider> {
  if (overrideProvider) return overrideProvider;
  if (cachedProvider) return cachedProvider;

  const kind = getEmailProviderKind();
  if (kind === 'gmail') {
    const { GmailApiEmailProvider } = await import('@/lib/email/gmail-api-email-provider');
    cachedProvider = new GmailApiEmailProvider();
  } else if (kind === 'smtp') {
    const { SmtpEmailProvider } = await import('@/lib/email/smtp-email-provider');
    cachedProvider = new SmtpEmailProvider();
  } else if (kind === 'mock') {
    cachedProvider = new MockEmailProvider();
  } else if (kind === 'file') {
    const { FileEmailProvider } = await import('@/lib/email/file-email-provider');
    cachedProvider = new FileEmailProvider();
  } else {
    cachedProvider = new LogEmailProvider();
  }
  return cachedProvider;
}
