import bcrypt from 'bcryptjs';

/**
 * 관리자 비밀번호 해싱.
 *
 * bcrypt(bcryptjs 구현)를 사용한다. bcryptjs 는 순수 JS 구현이라 네이티브 빌드 도구 없이
 * Windows/Linux/컨테이너 어디서나 동일하게 동작한다. 알고리즘 자체는 bcrypt 와 같다.
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

/**
 * 존재하지 않는 계정일 때도 동일한 시간이 걸리도록 사용하는 더미 해시.
 * (로그인 ID 존재 여부가 응답 시간으로 노출되는 것을 방지)
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1Uvm7ZgLoOfWXKpjkC4nJ2dxbA2dQdG';

export const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 10자 이상이며 영문 대문자, 소문자, 숫자, 특수문자 중 3종류 이상을 포함해야 합니다.';

/** 비밀번호 정책 검사 */
export function isPasswordPolicySatisfied(password: string): boolean {
  if (password.length < 10 || password.length > 100) return false;
  const kinds = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  return kinds >= 3;
}
