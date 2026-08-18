import { ValidationError } from '@/lib/errors';

/** 라우트 파라미터의 숫자 ID 파싱 */
export function parseNumericId(value: string, label = 'ID'): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

/** 요청 본문이 비어 있어도 안전하게 JSON 을 읽는다. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch {
    throw new ValidationError('요청 형식이 올바르지 않습니다.');
  }
}
