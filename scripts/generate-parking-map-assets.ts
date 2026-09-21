/**
 * 주차 위치 안내 PNG를 모든 자리 코드에 대해 미리 렌더링해 `generated/parking-maps/`에 저장한다.
 *
 * `renderParkingMapAttachment`(src/lib/email/parking-map-image.ts)의 resvg 렌더링은 동기
 * 네이티브 호출이라 코드당 2~3초씩 Node 이벤트 루프를 막는다. 승인 메일을 보낼 때마다 이걸
 * 실시간으로 돌리는 대신, 빌드 타임(`npm run build`의 prebuild 훅)에 한 번 미리 그려서 파일로
 * 남겨 두면 실제 서버는 렌더링 없이 파일만 읽으면 된다.
 *
 * 실행: npx tsx scripts/generate-parking-map-assets.ts (또는 npm run build 시 자동 실행)
 */
import fs from 'node:fs';
import path from 'node:path';

import { allStallCodes } from '../src/domain/parking-map-layout';
import { generatedAssetPath, renderParkingMapAttachment } from '../src/lib/email/parking-map-image';

function main() {
  const codes = allStallCodes();
  const failed: string[] = [];

  // renderParkingMapAttachment 는 기존 PNG 가 있으면 그걸 그대로 읽어 반환하므로, 도면이 바뀐 뒤
  // 다시 만들 때는 옛 파일을 먼저 지워야 새로 그려진다.
  fs.rmSync(path.dirname(generatedAssetPath('x')), { recursive: true, force: true });

  console.log(`주차 위치 안내 이미지 ${codes.length}개 생성 시작...`);

  codes.forEach((code, index) => {
    try {
      const attachment = renderParkingMapAttachment(code);
      if (!attachment) {
        failed.push(code);
        console.warn(`  [${index + 1}/${codes.length}] ${code}: 해당하는 도면 없음, 건너뜀`);
        return;
      }
      const targetPath = generatedAssetPath(code);
      fs.mkdirSync(targetPath.replace(/[^/\\]+$/, ''), { recursive: true });
      fs.writeFileSync(targetPath, attachment.content);
      console.log(`  [${index + 1}/${codes.length}] ${code} 완료`);
    } catch (error) {
      failed.push(code);
      console.error(`  [${index + 1}/${codes.length}] ${code} 실패:`, error);
    }
  });

  const succeeded = codes.length - failed.length;
  console.log(`완료: ${succeeded}/${codes.length}개 생성됨`);
  if (failed.length > 0) {
    console.log(`실패한 코드(${failed.length}개): ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
