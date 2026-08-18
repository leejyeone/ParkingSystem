import { apiSuccess, handleApiError } from '@/lib/api-response';
import { listReservationsForUser } from '@/services/reservation-service';
import { requireActiveUser } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/my/reservations — 로그인 회원이 신청한 예약 목록 */
export async function GET() {
  try {
    const session = await requireActiveUser();
    return apiSuccess(await listReservationsForUser(session.userId));
  } catch (error) {
    return handleApiError(error);
  }
}
