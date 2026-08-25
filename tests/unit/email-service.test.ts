import { EmailType, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setEmailProviderForTesting } from '@/lib/email/email-provider-factory';
import { MockEmailProvider } from '@/lib/email/mock-email-provider';
import { buildDedupeKey, requiresDedupe, sendEmailWithLog } from '@/lib/email/email-service';
import { renderReservationEmail } from '@/lib/email/email-template-service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { emailSendLog: { create: mocks.create, update: mocks.update } },
}));

const rendered = {
  subject: '[본사 주차] 테스트 메일',
  html: '<p>테스트</p>',
  text: '테스트',
};

let provider: MockEmailProvider;

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.create.mockResolvedValue({ emailLogId: 1 });
  mocks.update.mockResolvedValue({});

  provider = new MockEmailProvider();
  setEmailProviderForTesting(provider);
});

describe('EXIT_REMINDER 중복 발송 차단', () => {
  it('EXIT_REMINDER 만 멱등성 키가 필요하다', () => {
    expect(requiresDedupe(EmailType.EXIT_REMINDER)).toBe(true);
    expect(requiresDedupe(EmailType.APPROVED)).toBe(false);
    expect(requiresDedupe(EmailType.REQUEST_RECEIVED)).toBe(false);
  });

  it('멱등성 키는 예약 ID 와 이메일 종류로 구성된다', () => {
    expect(buildDedupeKey(42, EmailType.EXIT_REMINDER)).toBe('42:EXIT_REMINDER');
  });

  it('EXIT_REMINDER 발송 시 dedupe_key 를 함께 저장한다', async () => {
    await sendEmailWithLog({
      reservationId: 42,
      emailType: EmailType.EXIT_REMINDER,
      to: 'hong@example.com',
      rendered,
    });

    expect(mocks.create.mock.calls[0][0].data.dedupeKey).toBe('42:EXIT_REMINDER');
  });

  it('다른 메일 종류는 dedupe_key 를 저장하지 않는다', async () => {
    await sendEmailWithLog({
      reservationId: 42,
      emailType: EmailType.APPROVED,
      to: 'hong@example.com',
      rendered,
    });

    expect(mocks.create.mock.calls[0][0].data.dedupeKey).toBeNull();
  });

  it('이미 성공 발송된 예약이면 UNIQUE 충돌(P2002)로 SKIPPED 처리하고 재발송하지 않는다', async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await sendEmailWithLog({
      reservationId: 42,
      emailType: EmailType.EXIT_REMINDER,
      to: 'hong@example.com',
      rendered,
    });

    expect(result.status).toBe('SKIPPED');
    expect(provider.sentMessages).toHaveLength(0);
  });
});

describe('Gmail Provider 를 Mock 처리한 발송 성공/실패 처리', () => {
  it('발송에 성공하면 SUCCESS 와 provider 메시지 ID 를 기록한다', async () => {
    const result = await sendEmailWithLog({
      reservationId: 7,
      emailType: EmailType.APPROVED,
      to: 'hong@example.com',
      rendered,
    });

    expect(result.status).toBe('SUCCESS');
    expect(provider.sentMessages).toHaveLength(1);
    expect(provider.sentMessages[0].subject).toBe(rendered.subject);

    const updateData = mocks.update.mock.calls[0][0].data;
    expect(updateData.sendStatus).toBe('SUCCESS');
    expect(updateData.providerMessageId).toBe('mock-1');
    expect(updateData.sentAt).toBeInstanceOf(Date);
  });

  it('발송에 실패하면 FAILED 와 실패 사유를 기록하고 예외를 던지지 않는다', async () => {
    provider.shouldFail = true;
    provider.failReason = 'Gmail API 인증 오류(401): invalid_grant';

    const result = await sendEmailWithLog({
      reservationId: 7,
      emailType: EmailType.EXIT_REMINDER,
      to: 'hong@example.com',
      rendered,
    });

    expect(result.status).toBe('FAILED');
    expect(result.failReason).toContain('invalid_grant');

    const updateData = mocks.update.mock.calls[0][0].data;
    expect(updateData.sendStatus).toBe('FAILED');
    expect(updateData.failReason).toContain('invalid_grant');
    // 재시도가 가능하도록 멱등성 키를 해제한다.
    expect(updateData.dedupeKey).toBeNull();
  });
});

describe('이메일 템플릿', () => {
  const data = {
    reservationNo: 'PK-20260820-ABCDEF',
    requesterName: '홍길동',
    requesterType: 'VISITOR' as const,
    companyOrBranchName: '시노펙스',
    vehicleNo: '12가3456',
    visitStartAt: new Date('2026-08-20T00:00:00Z'),
    visitEndAt: new Date('2026-08-20T02:00:00Z'),
    accessUrl: 'http://localhost:3000/r/token-value',
  };

  it('HTML 과 Text 본문을 모두 제공한다', () => {
    const email = renderReservationEmail(EmailType.REQUEST_RECEIVED, data);

    expect(email.html).toContain('<!doctype html>');
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.text).not.toContain('<html');
  });

  it('예약번호는 본문에만 있고 제목에는 없다', () => {
    const email = renderReservationEmail(EmailType.REQUEST_RECEIVED, data);

    expect(email.subject).not.toContain('PK-20260820-ABCDEF');
    expect(email.html).toContain('PK-20260820-ABCDEF');
    expect(email.text).toContain('PK-20260820-ABCDEF');
  });

  it('성명을 마스킹하지 않고 원문으로 표시한다', () => {
    const email = renderReservationEmail(EmailType.REQUEST_RECEIVED, data);

    expect(email.html).toContain('홍길동');
    expect(email.text).toContain('홍길동');
    expect(email.html).not.toContain('홍*동');
  });

  it('차량번호를 마스킹하지 않고 원문으로 표시한다', () => {
    const email = renderReservationEmail(EmailType.APPROVED, data);

    expect(email.text).toContain('12가3456');
    expect(email.text).not.toContain('12가3***');
  });

  it('예약 조회 링크에는 보안 토큰이 포함된다', () => {
    const email = renderReservationEmail(EmailType.REQUEST_RECEIVED, data);
    expect(email.html).toContain('/r/token-value');
  });

  it('8종 이메일 모두 렌더링할 수 있다', () => {
    for (const emailType of Object.values(EmailType)) {
      const email = renderReservationEmail(emailType, data);
      expect(email.subject).toBeTruthy();
      expect(email.html).toBeTruthy();
      expect(email.text).toBeTruthy();
    }
  });
});
