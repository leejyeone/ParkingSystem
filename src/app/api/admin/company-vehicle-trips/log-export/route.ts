import type { NextRequest } from 'next/server';

import { tripsToLogRows } from '@/domain/company-vehicle-log';
import { handleApiError } from '@/lib/api-response';
import { buildCompanyVehicleLogWorkbook } from '@/lib/company-vehicle-log-excel';
import { kstDayRangeUtc, todayKstDateString } from '@/lib/datetime';
import { requireActiveAdmin } from '@/services/admin-auth-service';
import { listCompanyVehicleTrips } from '@/services/company-vehicle-trip-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/company-vehicle-trips/log-export — `/admin/company-vehicles/log`
 * 화면에 지금 보이는 차량·기간 그대로 종이 운행대장 양식의 엑셀로 내려받는다.
 * 쿼리 파라미터는 그 화면과 동일하게 맞춘다(vehicleId/dateFrom/dateTo/sort).
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

    const workbook = await buildCompanyVehicleLogWorkbook(tripsToLogRows(trips));
    const buffer = await workbook.xlsx.writeBuffer();

    // HTTP 헤더 값은 ASCII(ByteString)만 허용돼 한글 파일명을 그대로 못 넣는다 — ASCII
    // 대체 이름(filename=)과 RFC 5987 인코딩(filename*=)을 같이 준다. 대부분 브라우저는
    // filename*= 를 우선 읽어 실제로는 한글 파일명으로 저장된다.
    const filename = `차량배차신청현황_${todayKstDateString().replaceAll('-', '')}.xlsx`;

    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="company-vehicle-log.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
