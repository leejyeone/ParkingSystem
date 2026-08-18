/**
 * 차량번호 정규화 및 형식 검증.
 *
 * 저장/중복검사는 항상 정규화된 값(공백·하이픈 제거)을 기준으로 수행한다.
 */

/**
 * 차량번호 정규화.
 * - 일반 공백, 전각 공백, 하이픈(각종 대시), 마침표, 언더스코어를 제거한다.
 * - 영문은 대문자로 통일한다.
 */
export function normalizeVehicleNo(input: string | null | undefined): string {
  return (input ?? '')
    .replace(/[\s 　]/g, '')
    .replace(/[-‐-―－._]/g, '')
    .toUpperCase();
}

/**
 * 대한민국 자동차 등록번호 형식.
 *  - 신형: 12가3456 / 123가4567
 *  - 구형(지역 표기): 서울12가3456
 *  - 외교 등 특수번호: 외교123456
 */
const VEHICLE_NO_PATTERN = /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/;
const DIPLOMATIC_PATTERN = /^(?:외교|영사|준외|준영|국제|대표)\d{3,6}$/;

export function isValidVehicleNo(normalized: string): boolean {
  return VEHICLE_NO_PATTERN.test(normalized) || DIPLOMATIC_PATTERN.test(normalized);
}

export const VEHICLE_NO_ERROR_MESSAGE = '차량번호 형식이 올바르지 않습니다. (예: 12가3456)';
