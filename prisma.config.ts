// Prisma CLI 설정 파일.
// prisma.config.ts 가 존재하면 Prisma CLI 는 .env 를 자동으로 읽지 않으므로
// 여기에서 직접 dotenv 를 로드한다.
// (dotenv 는 이미 설정된 process.env 값을 덮어쓰지 않으므로
//  `dotenv -e .env.test -- prisma migrate deploy` 같은 테스트용 실행도 정상 동작한다.)
import 'dotenv/config';

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
