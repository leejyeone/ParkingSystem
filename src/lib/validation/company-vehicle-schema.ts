import { z } from 'zod';

import { requiredText, zonedDateTimeSchema } from '@/lib/validation/common';

/**
 * 법인 공용 차량 운행 신청 (로그인 직원 필수).
 * 신청자(운행 예정자)는 항상 서버가 로그인 세션의 직원 본인으로 고정한다 — 화면에서도
 * 수정할 수 없으므로 클라이언트에서 받지 않는다. 어떤 차량을 배정할지도 관리자가 승인
 * 시점에 정하므로 신청 단계에서는 받지 않는다.
 */
export const createCompanyVehicleTripSchema = z.object({
  destination: requiredText(200, '행선지'),
  reason: requiredText(500, '사유'),
  requestStartAt: zonedDateTimeSchema,
  requestEndAt: zonedDateTimeSchema,
});
