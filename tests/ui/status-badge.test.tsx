import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpaceTypeBadge, StatusBadge } from '@/components/ui/status-badge';

describe('예약 상태 배지', () => {
  it('상태 코드를 한국어 라벨로 표시한다', () => {
    render(<StatusBadge status="REQUESTED" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('승인 대기');
  });

  it('입차/출차 상태도 한국어로 표시한다', () => {
    const { rerender } = render(<StatusBadge status="PARKING" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('입차');

    rerender(<StatusBadge status="EXITED" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('출차');
  });
});

describe('주차면 유형 배지', () => {
  it('이중주차는 경고 표시와 함께 노출한다', () => {
    render(<SpaceTypeBadge spaceType="DOUBLE" />);
    const badge = screen.getByTestId('space-type-badge');

    expect(badge).toHaveTextContent('이중주차');
    expect(badge.textContent).toContain('⚠');
  });

  it('일반 주차면에는 경고 표시가 없다', () => {
    render(<SpaceTypeBadge spaceType="NORMAL" />);
    const badge = screen.getByTestId('space-type-badge');

    expect(badge).toHaveTextContent('일반');
    expect(badge.textContent).not.toContain('⚠');
  });
});
