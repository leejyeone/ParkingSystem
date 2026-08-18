import { describe, expect, it } from 'vitest';

import {
  buildReservationAccessUrl,
  generateAccessToken,
  generateReservationNo,
  hashAccessToken,
  safeCompareHash,
} from '@/lib/tokens';

describe('예약 접근 토큰 생성', () => {
  it('URL 안전한 문자만 포함한다', () => {
    const token = generateAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('매번 다른 값을 생성한다', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateAccessToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('토큰 해시 처리', () => {
  it('원본 토큰이 아닌 HMAC-SHA256 hex 값을 반환한다', () => {
    const raw = generateAccessToken();
    const hash = hashAccessToken(raw);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(raw);
    expect(hash).not.toBe(raw);
  });

  it('같은 입력과 같은 키에 대해 항상 같은 해시를 만든다', () => {
    const raw = 'fixed-token-value';
    expect(hashAccessToken(raw, 'secret-a')).toBe(hashAccessToken(raw, 'secret-a'));
  });

  it('서버 비밀키가 다르면 해시가 달라진다 (DB 유출만으로 역산 불가)', () => {
    const raw = 'fixed-token-value';
    expect(hashAccessToken(raw, 'secret-a')).not.toBe(hashAccessToken(raw, 'secret-b'));
  });

  it('입력이 1비트만 달라도 해시가 완전히 달라진다', () => {
    expect(hashAccessToken('token-a', 'k')).not.toBe(hashAccessToken('token-b', 'k'));
  });
});

describe('해시 비교', () => {
  it('같은 값이면 true, 다르면 false', () => {
    const hash = hashAccessToken('abc', 'k');
    expect(safeCompareHash(hash, hash)).toBe(true);
    expect(safeCompareHash(hash, hashAccessToken('abd', 'k'))).toBe(false);
  });

  it('길이가 다르면 false', () => {
    expect(safeCompareHash('abc', 'abcd')).toBe(false);
  });
});

describe('예약 조회 URL 생성', () => {
  it('토큰을 경로에 포함한다', () => {
    expect(buildReservationAccessUrl('http://localhost:3000', 'abc123')).toBe(
      'http://localhost:3000/r/abc123',
    );
  });

  it('기준 URL 의 끝 슬래시를 정리한다', () => {
    expect(buildReservationAccessUrl('http://localhost:3000///', 'abc')).toBe(
      'http://localhost:3000/r/abc',
    );
  });
});

describe('예약번호 생성', () => {
  it('PK-YYYYMMDD-XXXXXX 형식을 따른다', () => {
    expect(generateReservationNo('2026-08-20')).toMatch(/^PK-20260820-[A-Z2-9]{6}$/);
  });

  it('혼동하기 쉬운 문자(I, O, 0, 1)를 사용하지 않는다', () => {
    for (let i = 0; i < 100; i += 1) {
      const suffix = generateReservationNo('2026-08-20').split('-')[2];
      expect(suffix).not.toMatch(/[IO01]/);
    }
  });
});
