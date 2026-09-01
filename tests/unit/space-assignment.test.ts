import { SpaceType, type Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { pickAvailableSpace } from '@/services/space-assignment-service';

/**
 * pickAvailableSpace 는 DB 클라이언트를 마지막 인자로 받으므로,
 * 최소한의 동작만 흉내내는 가짜 클라이언트로 배정 규칙을 단위 검증할 수 있다.
 */
type FakeSpace = {
  spaceId: number;
  spaceCode: string;
  spaceType: SpaceType;
  displayOrder: number;
  isActive: boolean;
};

const ALL_SPACES: FakeSpace[] = [
  ...Array.from({ length: 3 }, (_, index) => ({
    spaceId: index + 1,
    spaceCode: `A-${String(index + 1).padStart(2, '0')}`,
    spaceType: SpaceType.NORMAL,
    displayOrder: index + 1,
    isActive: true,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    spaceId: 101 + index,
    spaceCode: `D-${String(index + 1).padStart(2, '0')}`,
    spaceType: SpaceType.DOUBLE,
    displayOrder: 101 + index,
    isActive: true,
  })),
];

function createFakeDb(occupiedSpaceIds: number[], spaces: FakeSpace[] = ALL_SPACES) {
  return {
    parkingReservation: {
      findMany: async () => occupiedSpaceIds.map((spaceId) => ({ assignedSpaceId: spaceId })),
    },
    parkingSpace: {
      findFirst: async (args: {
        where: { spaceType: SpaceType; spaceId?: { notIn: number[] } };
      }) => {
        const excluded = new Set(args.where.spaceId?.notIn ?? []);
        const candidates = spaces
          .filter((space) => space.isActive)
          .filter((space) => space.spaceType === args.where.spaceType)
          .filter((space) => !excluded.has(space.spaceId))
          .sort((a, b) => a.displayOrder - b.displayOrder);
        return candidates[0] ?? null;
      },
    },
  } as unknown as Prisma.TransactionClient;
}

const params = {
  visitStartAt: new Date('2026-08-20T01:00:00Z'),
  visitEndAt: new Date('2026-08-20T03:00:00Z'),
  doubleParkingEnabled: true,
};

describe('자동 주차면 배정', () => {
  it('비어 있는 일반 주차면 중 display_order 가 가장 빠른 곳을 고른다', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([]));
    expect(result?.spaceCode).toBe('A-01');
    expect(result?.spaceType).toBe(SpaceType.NORMAL);
  });

  it('앞 순서 일반 주차면이 사용 중이면 다음 일반 주차면을 고른다', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([1]));
    expect(result?.spaceCode).toBe('A-02');
  });

  it('일반 주차면이 모두 만차이면 이중주차 위치를 고른다', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([1, 2, 3]));
    expect(result?.spaceCode).toBe('D-01');
    expect(result?.spaceType).toBe(SpaceType.DOUBLE);
  });

  it('이중주차도 순서대로 고른다', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([1, 2, 3, 101]));
    expect(result?.spaceCode).toBe('D-02');
  });

  it('모든 주차면이 만차이면 배정 위치가 없다(null)', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([1, 2, 3, 101, 102]));
    expect(result).toBeNull();
  });

  it('이중주차가 비활성화되어 있으면 일반 만차 시 배정하지 않는다', async () => {
    const result = await pickAvailableSpace(
      { ...params, doubleParkingEnabled: false },
      createFakeDb([1, 2, 3]),
    );
    expect(result).toBeNull();
  });

  it('비활성 주차면은 배정 후보에서 제외한다', async () => {
    const spaces = ALL_SPACES.map((space) =>
      space.spaceId === 1 ? { ...space, isActive: false } : space,
    );
    const result = await pickAvailableSpace(params, createFakeDb([], spaces));
    expect(result?.spaceCode).toBe('A-02');
  });

  it('bufferMinutes 를 넘겨도(배관 확인) 동작이 바뀌지 않는다 — 실제 겹침 판정은 time-overlap 단위 테스트가 커버', async () => {
    const result = await pickAvailableSpace({ ...params, bufferMinutes: 10 }, createFakeDb([]));
    expect(result?.spaceCode).toBe('A-01');
  });

  it('bufferMinutes 를 생략하면 기존과 동일하게 동작한다(하위 호환)', async () => {
    const result = await pickAvailableSpace(params, createFakeDb([1]));
    expect(result?.spaceCode).toBe('A-02');
  });
});
