import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 싱글턴.
 * 개발 모드의 HMR 로 커넥션이 계속 늘어나는 것을 막기 위해 globalThis 에 보관한다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 쿼리 로그에는 파라미터(개인정보)가 포함될 수 있으므로 기본적으로 남기지 않는다.
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
