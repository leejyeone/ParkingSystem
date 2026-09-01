import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationForm } from '@/components/reservation/reservation-form';

// 신청 성공 화면(CompletionView)이 useRouter() 를 쓴다 — 앱 라우터 컨텍스트 없이
// 렌더링하는 단위 테스트에서는 직접 모킹해야 한다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const SETTINGS = {
  reservationMinLeadMinutes: 60,
  parkingOpenTime: '07:00',
  parkingCloseTime: '22:00',
  maxReservationHours: 12,
  spaceAssignmentEnabled: true,
  personalDataRetentionDays: 365,
  minDateTimeInput: '2026-08-20T10:00',
};

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * 제출 버튼은 필수 입력이 모두 채워져야 활성화된다(`isFormValid`). 서버 응답을 확인하는
 * 테스트는 그 전에 이 값들을 채워야 클릭이 실제로 제출을 트리거한다.
 * "당사 담당자"는 검색 API(`/api/employees/search`) 결과에서 골라야 하므로, fetch mock 은
 * 그 요청과 실제 예약 제출 요청을 URL로 구분해서 서로 다른 응답을 준다.
 */
function stubReservationFetch(reservationResponse: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/employees/search')) {
        return {
          json: async () => ({
            success: true,
            data: { employees: [{ employeeUserId: 1, name: '홍길동', departmentName: '총무팀' }] },
          }),
        } as Response;
      }
      return { json: async () => reservationResponse } as Response;
    }),
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('방문상호'), '시노펙스');
  await user.type(screen.getByLabelText('성명'), '홍길동');
  await user.type(screen.getByLabelText('이메일'), 'hong@example.com');
  await user.type(screen.getByLabelText('차량번호'), '12가3456');

  await user.type(screen.getByLabelText('당사 담당자'), '홍');
  const option = await screen.findByRole('button', { name: /홍길동/ });
  await user.click(option);

  fireEvent.change(screen.getByLabelText('입차 예정 시간'), {
    target: { value: '2026-08-20T11:00' },
  });
  fireEvent.change(screen.getByLabelText('출차 예정 시간'), {
    target: { value: '2026-08-20T13:00' },
  });

  await user.click(screen.getByLabelText(/개인정보 수집 및 이용에 동의합니다/));
}

describe('방문 신청 폼', () => {
  it('사용자가 주차 위치를 선택할 수 있는 입력이 없다', () => {
    render(<ReservationForm mode="visitor" settings={SETTINGS} />);

    expect(screen.queryByLabelText(/주차면/)).toBeNull();
    expect(screen.queryByLabelText(/주차 위치/)).toBeNull();
    expect(screen.getByText(/주차 위치는 관리자가 배정합니다/)).toBeInTheDocument();
  });

  it('차량번호 입력 중 공백과 하이픈을 자동으로 정리한다', async () => {
    const user = userEvent.setup();
    render(<ReservationForm mode="visitor" settings={SETTINGS} />);

    const input = screen.getByLabelText('차량번호') as HTMLInputElement;
    await user.type(input, '12가 - 3456');

    expect(input.value).toBe('12가3456');
  });

  it('서버가 돌려준 필드 오류를 해당 입력 아래에 한국어로 표시한다', async () => {
    stubReservationFetch({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '예약 시간을 다시 확인해 주세요.',
        fieldErrors: {
          visitStartAt: ['입차 예정 시간은 현재 시각으로부터 최소 60분 이후여야 합니다.'],
        },
      },
    });

    const user = userEvent.setup();
    render(<ReservationForm mode="visitor" settings={SETTINGS} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '방문 신청하기' }));

    await waitFor(() => {
      expect(
        screen.getByText('입차 예정 시간은 현재 시각으로부터 최소 60분 이후여야 합니다.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('예약 시간을 다시 확인해 주세요.')).toBeInTheDocument();
  });

  it('신청에 성공하면 예약번호와 승인 대기 상태를 안내한다', async () => {
    stubReservationFetch({
      success: true,
      data: {
        reservationId: 1,
        reservationNo: 'PK-20260820-ABCDEF',
        reservationStatus: 'REQUESTED',
        visitRangeText: '2026-08-20 09:00 ~ 11:00',
        emailNoticeSentTo: 'h***@example.com',
      },
    });

    const user = userEvent.setup();
    render(<ReservationForm mode="visitor" settings={SETTINGS} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '방문 신청하기' }));

    await waitFor(() => {
      expect(screen.getByTestId('reservation-no')).toHaveTextContent('PK-20260820-ABCDEF');
    });
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText(/h\*\*\*@example.com/)).toBeInTheDocument();
  });

  it('개인정보 수집 동의 체크박스를 제공한다', () => {
    render(<ReservationForm mode="visitor" settings={SETTINGS} />);

    const consent = screen.getByLabelText(/개인정보 수집 및 이용에 동의합니다/);
    expect(consent).toBeInTheDocument();
    expect((consent as HTMLInputElement).checked).toBe(false);
  });
});
