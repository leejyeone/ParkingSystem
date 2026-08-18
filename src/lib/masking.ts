/**
 * 개인정보 마스킹 유틸리티.
 *
 * 목록 화면과 이메일 본문에서는 항상 마스킹된 값을 사용한다.
 * 원본 값은 관리자 상세 화면(감사 로그 기록 후)에서만 노출한다.
 */

const MASK_CHAR = '*';

/**
 * 차량번호 마스킹. 뒤 3자리를 가린다.
 *   12가3456 -> 12가3***
 *   서울12가3456 -> 서울12가3***
 */
export function maskVehicleNo(vehicleNo: string | null | undefined): string {
  const value = (vehicleNo ?? '').trim();
  if (value === '') return '';
  if (value.length <= 3) return MASK_CHAR.repeat(value.length);
  return value.slice(0, value.length - 3) + MASK_CHAR.repeat(3);
}

/**
 * 성명 마스킹.
 *   홍길동 -> 홍*동
 *   홍길 -> 홍*
 *   홍 -> *
 *   남궁민수 -> 남**수
 */
export function maskName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  if (value === '') return '';
  if (value.length === 1) return MASK_CHAR;
  if (value.length === 2) return `${value[0]}${MASK_CHAR}`;
  return `${value[0]}${MASK_CHAR.repeat(value.length - 2)}${value[value.length - 1]}`;
}

/**
 * 이메일 마스킹. 로컬 파트의 첫 글자만 남긴다.
 *   hong@example.com -> h***@example.com
 */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  if (value === '') return '';
  const atIndex = value.lastIndexOf('@');
  if (atIndex <= 0) {
    // 도메인이 없는 값은 형식을 신뢰할 수 없으므로 전부 가린다.
    return MASK_CHAR.repeat(3);
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  return `${local[0]}${MASK_CHAR.repeat(3)}${domain}`;
}

/**
 * 휴대전화 마스킹. 앞 3자리와 뒤 4자리만 남긴다.
 *   010-1234-5678 -> 010-****-5678
 *   01012345678   -> 010-****-5678
 *   0212345678    -> 021-***-5678 (형식을 알 수 없는 경우도 중간을 가린다)
 */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits === '') return '';
  if (digits.length <= 7) {
    return `${digits.slice(0, 2)}${MASK_CHAR.repeat(Math.max(digits.length - 2, 0))}`;
  }
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  const middleLength = digits.length - 7;
  return `${head}-${MASK_CHAR.repeat(middleLength)}-${tail}`;
}

/** 휴대전화 표시용 하이픈 포맷 (관리자 상세 화면 전용) */
export function formatPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone ?? '';
}
