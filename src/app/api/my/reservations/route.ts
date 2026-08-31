import { apiSuccess, handleApiError } from '@/lib/api-response';
import { listReservationsForUser } from '@/services/reservation-service';
import { getSystemSettings } from '@/services/settings-service';
import { requireActiveUser } from '@/services/user-auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/my/reservations — 로그인 회원이 신청한 예약 목록 */
export async function GET() {
  try {
    const session = await requireActiveUser();
    const settings = await getSystemSettings();
    const reservations = await listReservationsForUser(session.userId, {
      entryExitManagementEnabled: settings.entryExitManagementEnabled,
    });
    return apiSuccess(reservations.items);
  } catch (error) {
    return handleApiError(error);
  }
}
