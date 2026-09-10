import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { NotFoundError } from '@/lib/errors';
import { employeeProfileUpdateSchema } from '@/lib/validation/employee-schema';
import {
  getEmployeeProfile,
  requireActiveEmployee,
  updateEmployeeProfile,
} from '@/services/employee-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/employee/profile — 내 정보 조회 (신청 폼 자동완성에 사용) */
export async function GET() {
  try {
    const session = await requireActiveEmployee();
    const profile = await getEmployeeProfile(session.employeeUserId);
    if (!profile) throw new NotFoundError('직원 정보를 찾을 수 없습니다.');

    return apiSuccess(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/employee/profile — 내 정보 수정 (차량번호·소속 사업장명·전화번호만 변경 가능) */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireActiveEmployee();
    const payload = employeeProfileUpdateSchema.parse(await readJsonBody(request));

    const profile = await updateEmployeeProfile(session.employeeUserId, payload);
    return apiSuccess(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
