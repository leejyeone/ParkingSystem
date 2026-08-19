import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from '@/components/ui/copy-button';

const RESERVATION_NO = 'PK-20260820-ABCDEF';

/**
 * jsdom 에는 navigator.clipboard 와 document.execCommand 가 없다.
 * 두 경로를 모두 직접 정의해 컴포넌트의 기본 경로와 대체 경로를 나눠서 검증한다.
 */
function defineProperty(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  defineProperty(navigator, 'clipboard', { writeText });
  defineProperty(window, 'isSecureContext', true);
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn().mockReturnValue(result);
  defineProperty(document, 'execCommand', execCommand);
  return execCommand;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

describe('예약번호 복사 버튼', () => {
  it('클릭하면 전달된 값을 클립보드에 복사한다', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton value={RESERVATION_NO} />);

    await user.click(screen.getByTestId('copy-button'));

    expect(writeText).toHaveBeenCalledWith(RESERVATION_NO);
  });

  it('복사에 성공하면 버튼 라벨이 "복사됨" 으로 바뀐다', async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    render(<CopyButton value={RESERVATION_NO} />);

    const button = screen.getByTestId('copy-button');
    expect(button).toHaveTextContent('복사');

    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveTextContent('복사됨');
    });
  });

  it('라벨을 바꿀 수 있고, 접근성 이름에 복사할 값이 포함된다', () => {
    stubClipboard(vi.fn());

    render(<CopyButton value={RESERVATION_NO} label="예약번호 복사" />);

    expect(
      screen.getByRole('button', { name: `예약번호 복사 (${RESERVATION_NO})` }),
    ).toBeInTheDocument();
  });

  it('클립보드 API 를 쓸 수 없으면 execCommand 로 대체 복사한다', async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const execCommand = stubExecCommand(true);

    render(<CopyButton value={RESERVATION_NO} />);

    await user.click(screen.getByTestId('copy-button'));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
    expect(screen.getByTestId('copy-button')).toHaveTextContent('복사됨');
  });

  it('두 방식 모두 실패하면 실패 안내를 보여준다', async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    stubExecCommand(false);

    render(<CopyButton value={RESERVATION_NO} />);

    await user.click(screen.getByTestId('copy-button'));

    await waitFor(() => {
      expect(screen.getByText(/복사에 실패했습니다/)).toBeInTheDocument();
    });
  });
});
