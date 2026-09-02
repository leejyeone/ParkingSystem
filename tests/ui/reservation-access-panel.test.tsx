import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReservationAccessPanel } from '@/components/reservation/reservation-access-panel';
import type { RequesterReservationView } from '@/lib/serializers/reservation-view';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const RESERVATION: RequesterReservationView = {
  reservationNo: 'PK-20260820-ABCDEF',
  requesterType: 'VISITOR',
  requesterTypeLabel: '방문객',
  reservationStatus: 'REQUESTED',
  reservationStatusLabel: '승인 대기',
  displayStatus: 'REQUESTED',
  displayStatusLabel: '승인 대기',
  companyOrBranchName: '시노펙스',
  requesterName: '홍길동',
  requesterEmail: 'hong@example.com',
  vehicleNo: '12가3456',
  visitPurpose: null,
  requestMemo: null,
  visitStartAt: '2026-08-20T09:00:00.000Z',
  visitEndAt: '2026-08-20T11:00:00.000Z',
  visitStartInput: '2026-08-20T18:00',
  visitEndInput: '2026-08-20T20:00',
  visitRangeText: '2026-08-20 18:00 ~ 20:00',
  assignedSpaceCode: null,
  isDoubleParking: false,
  rejectionReason: null,
  cancelReason: null,
  changeDeadlineText: '2026-08-20 17:00',
  canChange: true,
  changeBlockedReason: null,
};

const SETTINGS = {
  reservationMinLeadMinutes: 60,
  maxReservationHours: 12,
  spaceAssignmentEnabled: true,
};

function stubFetch(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => response }) as Response),
  );
}

/**
 * 조회 토큰(특히 마이페이지·직원 내역 경유 시 120분짜리)이 수정/취소 폼을 채우는
 * 도중 만료될 수 있다. 이 경우 폼 안에 오류만 띄우고 끝나면 사용자가 재조회 경로 없이
 * 갇히므로, 이미 있는 `/r/[token]` 페이지의 만료 안내 화면(InvalidTokenView)이 다시
 * 뜨도록 router.refresh() 를 호출해야 한다.
 */
describe('토큰 만료 시 수정/취소 폼의 처리', () => {
  it('예약 수정 중 토큰이 만료(NOT_FOUND)되면 폼 오류 대신 router.refresh() 를 호출한다', async () => {
    stubFetch({
      success: false,
      error: { code: 'NOT_FOUND', message: '유효하지 않거나 만료된 링크입니다.' },
    });

    const user = userEvent.setup();
    render(
      <ReservationAccessPanel
        token="tok"
        homeHref="/"
        initialReservation={RESERVATION}
        settings={SETTINGS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '예약 수정하기' }));
    await user.click(screen.getByRole('button', { name: '수정 내용 저장' }));

    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText('유효하지 않거나 만료된 링크입니다.')).not.toBeInTheDocument();
  });

  it('일반 검증 오류(NOT_FOUND 아님)는 폼 안에 그대로 표시하고 새로고침하지 않는다', async () => {
    stubFetch({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.' },
    });

    const user = userEvent.setup();
    render(
      <ReservationAccessPanel
        token="tok"
        homeHref="/"
        initialReservation={RESERVATION}
        settings={SETTINGS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '예약 수정하기' }));
    await user.click(screen.getByRole('button', { name: '수정 내용 저장' }));

    expect(await screen.findByText('입력값을 다시 확인해 주세요.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('예약 취소 중 토큰이 만료(NOT_FOUND)되면 폼 오류 대신 router.refresh() 를 호출한다', async () => {
    stubFetch({
      success: false,
      error: { code: 'NOT_FOUND', message: '유효하지 않거나 만료된 링크입니다.' },
    });

    const user = userEvent.setup();
    render(
      <ReservationAccessPanel
        token="tok"
        homeHref="/"
        initialReservation={RESERVATION}
        settings={SETTINGS}
      />,
    );

    await user.click(screen.getByRole('button', { name: '예약 취소하기' }));
    await user.type(screen.getByLabelText('취소 사유'), '일정 변경');
    await user.click(screen.getByRole('button', { name: '예약 취소 확정' }));

    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText('유효하지 않거나 만료된 링크입니다.')).not.toBeInTheDocument();
  });
});
