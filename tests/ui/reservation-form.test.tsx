import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationForm } from '@/components/reservation/reservation-form';

const SETTINGS = {
  reservationMinLeadMinutes: 60,
  parkingOpenTime: '07:00',
  parkingCloseTime: '22:00',
  maxReservationHours: 12,
  minDateTimeInput: '2026-08-20T10:00',
};

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('주차 신청 폼', () => {
  it('사용자가 주차 위치를 선택할 수 있는 입력이 없다', () => {
    render(<ReservationForm settings={SETTINGS} />);

    expect(screen.queryByLabelText(/주차면/)).toBeNull();
    expect(screen.queryByLabelText(/주차 위치/)).toBeNull();
    expect(screen.getByText(/주차 위치는 시스템이 자동으로 추천/)).toBeInTheDocument();
  });

  it('차량번호 입력 중 공백과 하이픈을 자동으로 정리한다', async () => {
    const user = userEvent.setup();
    render(<ReservationForm settings={SETTINGS} />);

    const input = screen.getByLabelText('차량번호') as HTMLInputElement;
    await user.type(input, '12가 - 3456');

    expect(input.value).toBe('12가3456');
  });

  it('서버가 돌려준 필드 오류를 해당 입력 아래에 한국어로 표시한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '예약 시간을 다시 확인해 주세요.',
            fieldErrors: {
              visitStartAt: ['입차 예정 시간은 현재 시각으로부터 최소 60분 이후여야 합니다.'],
            },
          },
        }),
      }),
    );

    const user = userEvent.setup();
    render(<ReservationForm settings={SETTINGS} />);
    await user.click(screen.getByRole('button', { name: '주차 신청하기' }));

    await waitFor(() => {
      expect(
        screen.getByText('입차 예정 시간은 현재 시각으로부터 최소 60분 이후여야 합니다.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('예약 시간을 다시 확인해 주세요.')).toBeInTheDocument();
  });

  it('신청에 성공하면 예약번호와 승인 대기 상태를 안내한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: {
            reservationNo: 'PK-20260820-ABCDEF',
            reservationStatus: 'REQUESTED',
            visitRangeText: '2026-08-20 09:00 ~ 11:00',
            emailNoticeSentTo: 'h***@example.com',
          },
        }),
      }),
    );

    const user = userEvent.setup();
    render(<ReservationForm settings={SETTINGS} />);
    await user.click(screen.getByRole('button', { name: '주차 신청하기' }));

    await waitFor(() => {
      expect(screen.getByTestId('reservation-no')).toHaveTextContent('PK-20260820-ABCDEF');
    });
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText(/h\*\*\*@example.com/)).toBeInTheDocument();
  });

  it('개인정보 수집 동의 체크박스를 제공한다', () => {
    render(<ReservationForm settings={SETTINGS} />);

    const consent = screen.getByLabelText(/개인정보 수집 및 이용에 동의합니다/);
    expect(consent).toBeInTheDocument();
    expect((consent as HTMLInputElement).checked).toBe(false);
  });
});
