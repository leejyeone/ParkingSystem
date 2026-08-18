import { AccessTokenType, type Prisma } from '@prisma/client';

import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { generateAccessToken, hashAccessToken } from '@/lib/tokens';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * 예약 접근 토큰 관리.
 *
 * 정책(README "보안 및 개인정보 처리 주의사항" 참고)
 *  - 예약 1건당 VIEW 토큰 1개를 발급하고, 조회·수정·취소에 동일 토큰을 사용한다.
 *    (수정/취소는 조회 화면에서만 진입 가능하고 위험도가 동일하므로 토큰을 나눠도
 *     보안 이득이 없는 반면, 메일 본문에 링크가 3개 생겨 사용성이 나빠진다.)
 *  - 원본 토큰은 DB 에 저장하지 않고 HMAC-SHA256 해시만 저장한다.
 *  - 만료: 방문 종료 시각 + TOKEN_VALIDITY_DAYS_AFTER_VISIT 일
 */

export const TOKEN_VALIDITY_DAYS_AFTER_VISIT = 7;

export function calculateTokenExpiry(visitEndAt: Date): Date {
  return new Date(visitEndAt.getTime() + TOKEN_VALIDITY_DAYS_AFTER_VISIT * 24 * 60 * 60 * 1000);
}

/** 예약 생성 시 접근 토큰 발급. 원본 토큰은 이 반환값으로만 얻을 수 있다. */
export async function issueAccessToken(
  params: { reservationId: number; visitEndAt: Date; tokenType?: AccessTokenType },
  db: Db = prisma,
): Promise<{ rawToken: string; tokenId: number }> {
  const rawToken = generateAccessToken();
  const created = await db.reservationAccessToken.create({
    data: {
      reservationId: params.reservationId,
      tokenHash: hashAccessToken(rawToken),
      tokenType: params.tokenType ?? AccessTokenType.VIEW,
      expiresAt: calculateTokenExpiry(params.visitEndAt),
      isActive: true,
    },
    select: { tokenId: true },
  });
  return { rawToken, tokenId: created.tokenId };
}

/** 예약 시간이 변경되면 토큰 만료 시각을 함께 연장한다. */
export async function extendTokenExpiry(
  params: { reservationId: number; visitEndAt: Date },
  db: Db = prisma,
): Promise<void> {
  await db.reservationAccessToken.updateMany({
    where: { reservationId: params.reservationId, isActive: true },
    data: { expiresAt: calculateTokenExpiry(params.visitEndAt) },
  });
}

export type ResolvedAccessToken = {
  tokenId: number;
  reservationId: number;
  tokenType: AccessTokenType;
};

/**
 * 원본 토큰으로 예약을 식별한다.
 *
 * 실패 사유(없음/비활성/만료)를 구분해서 알려주지 않고 동일한 메시지를 반환한다.
 * 토큰 존재 여부가 노출되면 대입 공격의 단서가 되기 때문이다.
 */
export async function resolveAccessToken(
  rawToken: string,
  options: { markUsed?: boolean } = {},
  db: Db = prisma,
): Promise<ResolvedAccessToken> {
  const invalid = new NotFoundError(
    '유효하지 않거나 만료된 링크입니다. 이메일로 받으신 최신 링크를 사용해 주세요.',
  );

  if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
    throw invalid;
  }

  const token = await db.reservationAccessToken.findUnique({
    where: { tokenHash: hashAccessToken(rawToken) },
    select: {
      tokenId: true,
      reservationId: true,
      tokenType: true,
      isActive: true,
      expiresAt: true,
    },
  });

  if (!token || !token.isActive || token.expiresAt.getTime() <= Date.now()) {
    throw invalid;
  }

  if (options.markUsed) {
    await db.reservationAccessToken.update({
      where: { tokenId: token.tokenId },
      data: { lastUsedAt: new Date() },
    });
  }

  return {
    tokenId: token.tokenId,
    reservationId: token.reservationId,
    tokenType: token.tokenType,
  };
}
