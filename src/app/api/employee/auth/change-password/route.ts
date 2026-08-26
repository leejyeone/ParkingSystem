import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { employeeChangePasswordSchema } from '@/lib/validation/employee-schema';
import {
  changeEmployeePasswordOnFirstLogin,
  requireActiveEmployee,
} from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /api/employee/auth/change-password — 첫 로그인 강제 비밀번호 변경 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireActiveEmployee();
    const { password } = employeeChangePasswordSchema.parse(await readJsonBody(request));

    await changeEmployeePasswordOnFirstLogin(session.employeeUserId, password);

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
