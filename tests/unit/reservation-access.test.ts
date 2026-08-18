import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors';
import { hashAccessToken } from '@/lib/tokens';
import {
  calculateTokenExpiry,
  resolveAccessToken,
  TOKEN_VALIDITY_DAYS_AFTER_VISIT,
} from '@/services/reservation-access-service';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    reservationAccessToken: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

// vi.mock 은 import 보다 먼저 호이스팅되므로 아래 정적 import 도 모킹된 prisma 를 사용한다.
const RAW_TOKEN = 'a'.repeat(43);

function tokenRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tokenId: 1,
    reservationId: 10,
    tokenType: 'VIEW',
    isActive: true,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findUnique.mockReset();
  mocks.update.mockReset();
  mocks.update.mockResolvedValue({});
});

describe('토큰 만료 시각 계산', () => {
  it('방문 종료 시각 + 유효기간(일) 로 계산한다', () => {
    const visitEndAt = new Date('2026-08-20T05:00:00Z');
    const expiry = calculateTokenExpiry(visitEndAt);

    expect(expiry.getTime() - visitEndAt.getTime()).toBe(
      TOKEN_VALIDITY_DAYS_AFTER_VISIT * 24 * 60 * 60 * 1000,
    );
  });
});

describe('토큰 검증', () => {
  it('원본 토큰이 아니라 해시로 조회한다', async () => {
    mocks.findUnique.mockResolvedValue(tokenRow());

    await resolveAccessToken(RAW_TOKEN);

    const calledWith = mocks.findUnique.mock.calls[0][0];
    expect(calledWith.where.tokenHash).toBe(hashAccessToken(RAW_TOKEN));
    expect(calledWith.where.tokenHash).not.toBe(RAW_TOKEN);
  });

  it('유효한 토큰이면 예약 ID 를 돌려준다', async () => {
    mocks.findUnique.mockResolvedValue(tokenRow());

    const resolved = await resolveAccessToken(RAW_TOKEN);
    expect(resolved.reservationId).toBe(10);
  });

  it('만료된 토큰은 거부한다', async () => {
    mocks.findUnique.mockResolvedValue(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));

    await expect(resolveAccessToken(RAW_TOKEN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('비활성화된 토큰은 거부한다', async () => {
    mocks.findUnique.mockResolvedValue(tokenRow({ isActive: false }));

    await expect(resolveAccessToken(RAW_TOKEN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('존재하지 않는 토큰은 거부한다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(resolveAccessToken(RAW_TOKEN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('실패 사유를 구분해 알려주지 않는다 (열거 공격 방지)', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const notFound = await resolveAccessToken(RAW_TOKEN).catch((error: Error) => error.message);

    mocks.findUnique.mockResolvedValue(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));
    const expired = await resolveAccessToken(RAW_TOKEN).catch((error: Error) => error.message);

    expect(notFound).toBe(expired);
  });

  it('형식이 비정상적으로 짧거나 긴 토큰은 DB 조회 없이 거부한다', async () => {
    await expect(resolveAccessToken('short')).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveAccessToken('x'.repeat(300))).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('markUsed 옵션이 있으면 마지막 사용 시각을 갱신한다', async () => {
    mocks.findUnique.mockResolvedValue(tokenRow());

    await resolveAccessToken(RAW_TOKEN, { markUsed: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);

    mocks.update.mockClear();
    await resolveAccessToken(RAW_TOKEN);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
