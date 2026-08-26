import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { employeeSearchSchema } from '@/lib/validation/employee-schema';
import { searchActiveEmployees } from '@/services/employee-directory-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/employees/search
 * 예약 신청 화면에서 "당사 담당자"를 검색한다. 방문객 본인 신청도 써야 하므로 공개(비로그인) 접근을
 * 허용하되, 검색어를 서버 로그에 남기지 않도록 GET 대신 POST를 쓰고 IP 기준으로 레이트리밋한다.
 */
export async function POST(request: NextRequest) {
  try {
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
