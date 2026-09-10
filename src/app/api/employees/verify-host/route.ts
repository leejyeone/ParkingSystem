import type { NextRequest } from 'next/server';

import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { ValidationError } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRequestContext } from '@/lib/request-context';
import { verifyHostEmployeeSchema } from '@/lib/validation/employee-schema';
import { verifyHostEmployee } from '@/services/employee-directory-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/employees/verify-host
 * 회원가입/마이페이지에서 "당사 담당자"를 이름+전화번호로 확정한다(공개, 비로그인 가능).
 * 명부 목록은 절대 노출하지 않는다 — /api/employees/search(관리자 전용)와 달리 단건 검증만 응답한다.
 * 이름/전화 중 어느 쪽이 틀렸는지는 알려주지 않는다(대입 공격 방지).
 */
export async function POST(request: NextRequest) {
  try {
    const { ipAddress } = getRequestContext(request.headers);
    consumeRateLimit({
      key: `employee-verify-host:${ipAddress ?? 'unknown'}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: '확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });

    const { name, phone } = verifyHostEmployeeSchema.parse(await readJsonBody(request));
    const employee = await verifyHostEmployee(name, phone);

    if (!employee) {
      throw new ValidationError('일치하는 담당자를 찾을 수 없습니다.', {
        name: ['일치하는 담당자를 찾을 수 없습니다.'],
      });
    }

    return apiSuccess(employee);
  } catch (error) {
    return handleApiError(error);
  }
}
