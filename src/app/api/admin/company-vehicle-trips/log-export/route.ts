import type { NextRequest } from 'next/server';

import { tripsToLogRows, type CompanyVehicleLogCellRow } from '@/domain/company-vehicle-log';
import { readJsonBody } from '@/lib/api-helpers';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { buildCompanyVehicleLogWorkbook } from '@/lib/company-vehicle-log-excel';
import { kstDayRangeUtc, todayKstDateString } from '@/lib/datetime';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function xlsxHeaders(): HeadersInit {
  // HTTP 헤더 값은 ASCII(ByteString)만 허용돼 한글 파일명을 그대로 못 넣는다 — ASCII
  // 대체 이름(filename=)과 RFC 5987 인코딩(filename*=)을 같이 준다. 대부분 브라우저는
  // filename*= 를 우선 읽어 실제로는 한글 파일명으로 저장된다.
  const filename = `차량배차신청현황_${todayKstDateString().replaceAll('-', '')}.xlsx`;
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="company-vehicle-log.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };
}

/**
 * GET /api/admin/company-vehicle-trips/log-export — `/admin/logs/company-vehicles` 화면에
 * 지금 보이는 차량·기간 그대로 조회한다. 쿼리 파라미터는 그 화면과 동일하게 맞춘다
 * (vehicleId/dateFrom/dateTo/sort). 기본은 엑셀 파일을 바로 내려받지만, `format=json`이면
 * 미리보기 패널이 편집할 수 있게 셀 값 배열만 JSON으로 돌려준다.
 */
export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();

    const params = request.nextUrl.searchParams;
    const vehicleId = Number(params.get('vehicleId'));
    if (!vehicleId || vehicleId <= 0) {
      return new Response('vehicleId가 필요합니다.', { status: 400 });
    }

    const dateFromParam = params.get('dateFrom');
    const dateToParam = params.get('dateTo');
    const dateFrom = dateFromParam && DATE_PATTERN.test(dateFromParam) ? dateFromParam : undefined;
    const dateTo = dateToParam && DATE_PATTERN.test(dateToParam) ? dateToParam : undefined;
    const sort = params.get('sort') === 'request_desc' ? 'request_desc' : 'request_asc';

    const trips = await listCompanyVehicleTrips({
      vehicleId,
      dateFrom: dateFrom ? kstDayRangeUtc(dateFrom).start : undefined,
      dateTo: dateTo ? kstDayRangeUtc(dateTo).end : undefined,
      actualEntryOnly: true,
      order: sort === 'request_desc' ? 'requestStartAt_desc' : 'requestStartAt_asc',
    });

    const rows = tripsToLogRows(trips);

    if (params.get('format') === 'json') {
      return apiSuccess({ rows });
    }

    const workbook = await buildCompanyVehicleLogWorkbook(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, { headers: xlsxHeaders() });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/company-vehicle-trips/log-export — 미리보기 패널에서 관리자가 셀을
 * 고친 뒤 "다운로드"를 누르면, 그 편집된 값 그대로(다시 조회하지 않고) 엑셀을 만들어
 * 내려준다. 본문: `{ rows: (string|number)[][] }`.
 */
export async function POST(request: NextRequest) {
  try {
    await requireActiveAdmin();

    const body = (await readJsonBody(request)) as { rows?: unknown };
    if (!Array.isArray(body.rows)) {
      return new Response('rows 배열이 필요합니다.', { status: 400 });
    }

    const rows = body.rows as CompanyVehicleLogCellRow[];
    const workbook = await buildCompanyVehicleLogWorkbook(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, { headers: xlsxHeaders() });
  } catch (error) {
    return handleApiError(error);
  }
}
