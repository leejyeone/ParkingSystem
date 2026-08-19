import type { NextRequest } from 'next/server';

import { parseNumericId } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  isAllowedMapImageType,
  MAP_IMAGE_MAX_BYTES,
  mapImageSizeMessage,
  mapImageTypeMessage,
} from '@/lib/map-image';
import { getRequestContext } from '@/lib/request-context';
import { requireActiveAdmin, requireSystemAdmin } from '@/services/admin-auth-service';
import {
  clearParkingAreaMapImage,
  getParkingAreaMapImage,
  saveParkingAreaMapImage,
} from '@/services/parking-space-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/parking-areas/[id]/map — 도면 이미지 내려받기 (관리자 전용)
 *
 * SVG 를 직접 열었을 때 스크립트가 실행되지 않도록 CSP 와 nosniff 를 함께 내린다.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireActiveAdmin();
    const { id } = await context.params;
    const image = await getParkingAreaMapImage(parseNumericId(id, '구역 ID'));

    if (!image) {
      throw new NotFoundError('등록된 도면이 없습니다.');
    }

    /*
     * Prisma 가 돌려주는 Uint8Array 는 Node 의 공용 버퍼(기본 64KB)를 가리키는 "뷰" 다.
     * (byteOffset > 0, buffer.byteLength >> length)
     * .buffer 를 그대로 넘기면 실제 파일이 아니라 버퍼 전체가 응답으로 나간다.
     * 정확한 길이만 복사해서 보낸다.
     */
    const body = new Uint8Array(image.data.byteLength);
    body.set(image.data);

    return new Response(body, {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        // 내용이 바뀌면 URL 의 v 파라미터가 바뀌므로 캐시해도 안전하다.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/parking-areas/[id]/map — 도면 파일 업로드 (SYSTEM_ADMIN 전용) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSystemAdmin();
    const { id } = await context.params;
    const areaId = parseNumericId(id, '구역 ID');

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('도면 파일을 선택해 주세요.', {
        file: ['도면 파일을 선택해 주세요.'],
      });
    }
    if (file.size > MAP_IMAGE_MAX_BYTES) {
      throw new ValidationError(mapImageSizeMessage(), { file: [mapImageSizeMessage()] });
    }
    if (!isAllowedMapImageType(file.type)) {
      throw new ValidationError(mapImageTypeMessage(), { file: [mapImageTypeMessage()] });
    }

    const saved = await saveParkingAreaMapImage(
      areaId,
      {
        data: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type,
        fileName: file.name,
      },
      { adminUserId: session.adminUserId, requestContext: getRequestContext(request.headers) },
    );

    return apiSuccess(saved);
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/admin/parking-areas/[id]/map — 도면 삭제 (SYSTEM_ADMIN 전용) */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSystemAdmin();
    const { id } = await context.params;

    await clearParkingAreaMapImage(parseNumericId(id, '구역 ID'), {
      adminUserId: session.adminUserId,
      requestContext: getRequestContext(request.headers),
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
