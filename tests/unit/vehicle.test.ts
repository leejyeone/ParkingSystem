import { describe, expect, it } from 'vitest';

import { isValidVehicleNo, normalizeVehicleNo } from '@/lib/vehicle';

describe('차량번호 정규화', () => {
  it('공백과 하이픈을 제거한다', () => {
    expect(normalizeVehicleNo('12가 3456')).toBe('12가3456');
    expect(normalizeVehicleNo('12가-3456')).toBe('12가3456');
    expect(normalizeVehicleNo(' 123가 4567 ')).toBe('123가4567');
  });

  it('전각 공백과 다양한 대시 문자도 제거한다', () => {
    expect(normalizeVehicleNo('12가　3456')).toBe('12가3456');
    expect(normalizeVehicleNo('12가—3456')).toBe('12가3456');
    expect(normalizeVehicleNo('12가－3456')).toBe('12가3456');
  });

  it('영문은 대문자로 통일한다', () => {
    expect(normalizeVehicleNo('ab 12가 3456')).toBe('AB12가3456');
  });

  it('null / undefined 는 빈 문자열로 처리한다', () => {
    expect(normalizeVehicleNo(null)).toBe('');
    expect(normalizeVehicleNo(undefined)).toBe('');
  });

  it('정규화 결과는 멱등이다', () => {
    const once = normalizeVehicleNo('12가 - 3456');
    expect(normalizeVehicleNo(once)).toBe(once);
  });
});

describe('차량번호 형식 검증', () => {
  it('신형/구형 번호판을 허용한다', () => {
    expect(isValidVehicleNo('12가3456')).toBe(true);
    expect(isValidVehicleNo('123가4567')).toBe(true);
    expect(isValidVehicleNo('서울12가3456')).toBe(true);
    expect(isValidVehicleNo('외교123456')).toBe(true);
  });

  it('형식이 맞지 않으면 거부한다', () => {
    expect(isValidVehicleNo('')).toBe(false);
    expect(isValidVehicleNo('1가345')).toBe(false);
    expect(isValidVehicleNo('12AB3456')).toBe(false);
    expect(isValidVehicleNo('12가34567')).toBe(false);
    expect(isValidVehicleNo('12가 3456')).toBe(false); // 정규화 전 값은 거부
  });
});
