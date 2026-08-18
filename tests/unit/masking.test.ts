import { describe, expect, it } from 'vitest';

import { formatPhone, maskEmail, maskName, maskPhone, maskVehicleNo } from '@/lib/masking';

describe('차량번호 마스킹', () => {
  it('뒤 3자리를 가린다', () => {
    expect(maskVehicleNo('12가3456')).toBe('12가3***');
    expect(maskVehicleNo('123가4567')).toBe('123가4***');
    expect(maskVehicleNo('서울12가3456')).toBe('서울12가3***');
  });

  it('짧은 값은 전부 가린다', () => {
    expect(maskVehicleNo('12')).toBe('**');
    expect(maskVehicleNo('123')).toBe('***');
  });

  it('빈 값은 빈 문자열을 반환한다', () => {
    expect(maskVehicleNo('')).toBe('');
    expect(maskVehicleNo(null)).toBe('');
  });
});

describe('성명 마스킹', () => {
  it('가운데 글자를 가린다', () => {
    expect(maskName('홍길동')).toBe('홍*동');
    expect(maskName('남궁민수')).toBe('남**수');
  });

  it('두 글자 이름은 뒤 글자를 가린다', () => {
    expect(maskName('홍길')).toBe('홍*');
  });

  it('한 글자 이름은 전부 가린다', () => {
    expect(maskName('홍')).toBe('*');
  });
});

describe('이메일 마스킹', () => {
  it('로컬 파트의 첫 글자만 남긴다', () => {
    expect(maskEmail('hong@example.com')).toBe('h***@example.com');
    expect(maskEmail('a@b.co.kr')).toBe('a***@b.co.kr');
  });

  it('형식이 아니면 전부 가린다', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('')).toBe('');
  });
});

describe('휴대전화 마스킹', () => {
  it('앞 3자리와 뒤 4자리만 남긴다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678');
    expect(maskPhone('01012345678')).toBe('010-****-5678');
    expect(maskPhone('0111234567')).toBe('011-***-4567');
  });

  it('빈 값은 빈 문자열을 반환한다', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
  });
});

describe('휴대전화 표시 포맷', () => {
  it('하이픈을 넣어 표시한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('0111234567')).toBe('011-123-4567');
  });
});
