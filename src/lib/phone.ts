/**
 * 전화번호 입력 포맷팅.
 *
 * 입력창에 타이핑하는 동안 보기 편하도록 3-4-4 자리로 하이픈을 자동으로 넣어준다
 * (예: 01012345678 -> 010-1234-5678). 서버 쪽 비교(verifyHostEmployee)는 숫자만
 * 추출해서 하므로, 하이픈이 섞여 그대로 전송돼도 매칭에는 영향이 없다.
 */
export function formatPhoneInput(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
