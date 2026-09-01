import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScheduleCard, type EditableFields } from '@/components/admin/reservation-detail-cards';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const INITIAL: EditableFields = {
  companyOrBranchName: '시노펙스',
  requesterName: '홍길동',
  vehicleNo: '12가3456',
  visitPurpose: '',
  requestMemo: '',
  visitStartAt: '2026-08-20T09:00',
  visitEndAt: '2026-08-20T11:00',
};

function renderCard() {
  return render(
    <ScheduleCard
      reservationId={1}
      editable
      initial={INITIAL}
      entryExitManagementEnabled
      actualEntryAt="2026-08-20T09:05"
      actualExitAt="2026-08-20T11:30"
      readOnly={{
        title: '일정',
        visitRangeText: '2026-08-20 09:00 ~ 11:00',
        actualEntryText: '-',
        actualExitText: '-',
        spaceSection: null,
        rejectionReason: null,
        cancelReason: null,
      }}
    />,
  );
}

/**
 * ScheduleCard 의 저장은 일정(PUT /api/admin/reservations/[id])과 입출차 기록
 * (PUT .../entry-exit-record) 을 순차로 두 번 호출한다. 일정 저장이 먼저 성공한 뒤
 * 입출차 기록 저장만 실패하는 경우, "취소"를 눌러도 이미 서버에 반영된 일정으로
 * 되돌아가야 한다(저장 전 값으로 되돌리면 화면과 DB 상태가 어긋난다).
 */
describe('ScheduleCard 부분 저장 실패', () => {
  it('일정 저장 성공 후 입출차 기록 저장이 실패해도, 취소하면 새로 저장된 일정을 유지한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/entry-exit-record')) {
          return {
            json: async () => ({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: '입출차 기록을 저장하지 못했습니다.' },
            }),
          } as Response;
        }
        return { json: async () => ({ success: true, data: {} }) } as Response;
      }),
    );

    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: '수정하기' }));

    const startInput = screen.getByLabelText('입차 예정');
    await user.clear(startInput);
    await user.type(startInput, '2026-08-20T10:00');

    // 출차 기록도 함께 지워서 두 번째 요청(입출차 기록 저장)이 실제로 나가게 한다.
    await user.click(screen.getByRole('button', { name: '출차 삭제' }));

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByText('입출차 기록을 저장하지 못했습니다.')).toBeInTheDocument();
    });
    // 일정 저장(1단계)은 성공했으므로 새로고침되어 있어야 한다.
    expect(refresh).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '취소' }));

    // 편집 화면을 다시 열어도 "저장 전" 값(09:00)이 아니라 방금 저장된 값(10:00)이 보여야 한다.
    await user.click(screen.getByRole('button', { name: '수정하기' }));
    expect(screen.getByLabelText('입차 예정')).toHaveValue('2026-08-20T10:00');
  });
});
