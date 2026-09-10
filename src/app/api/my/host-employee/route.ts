import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { verifyHostEmployeeSchema } from '@/lib/validation/employee-schema';
import { requireActiveUser, updateUserHostEmployee } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/my/host-employee — 마이페이지의 "담당자 변경".
 * 이름+전화 재확인 후 즉시 반영한다(회원가입과 동일한 검증, 이메일 알림은 없음).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireActiveUser();
    const { name, phone } = verifyHostEmployeeSchema.parse(await readJsonBody(request));

    await updateUserHostEmployee(session.userId, { name, phone });

    return apiSuccess({ updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
