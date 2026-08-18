import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { NotFoundError } from '@/lib/errors';
import { userProfileUpdateSchema } from '@/lib/validation/user-schema';
import { getUserProfile, requireActiveUser, updateUserProfile } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/my/profile — 내 정보 조회 (신청 폼 자동완성에 사용) */
export async function GET() {
  try {
    const session = await requireActiveUser();
    const profile = await getUserProfile(session.userId);
    if (!profile) throw new NotFoundError('회원 정보를 찾을 수 없습니다.');

    return apiSuccess(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/my/profile — 내 정보 수정 (비밀번호는 값이 있을 때만 변경) */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireActiveUser();
    const payload = userProfileUpdateSchema.parse(await readJsonBody(request));

    const profile = await updateUserProfile(session.userId, payload);
    return apiSuccess(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
