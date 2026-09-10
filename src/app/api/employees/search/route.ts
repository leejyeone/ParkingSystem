import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { employeeSearchSchema } from '@/lib/validation/employee-schema';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { searchActiveEmployees } from '@/services/employee-directory-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/employees/search
 * 직원 명부 이름/부서 부분일치 검색(최대 20명 목록 반환). 명부 노출 자체가 보안상
 * 민감해 관리자 전용으로 잠근다(반복예약 관리자 화면의 직원 검색에서만 쓴다) — 방문객/직원
 * 본인용 "당사 담당자" 확인은 /api/employees/verify-host(이름+전화 단건 검증)를 쓴다.
 */
export async function POST(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `employee-search:${ipAddress ?? 'unknown'}`,
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: '검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const { query } = employeeSearchSchema.parse(await readJsonBody(request));
    const employees = await searchActiveEmployees(query);

    return apiSuccess({ employees });
  } catch (error) {
    return handleApiError(error);
  }
}
