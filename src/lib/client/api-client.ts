'use client';

/** 클라이언트에서 사용하는 API 호출 헬퍼. 서버 응답 형식(success/data/error)을 그대로 다룬다. */

export type ApiErrorPayload = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ApiResult<T> =
  { ok: true; data: T; meta?: Record<string, unknown> } | { ok: false; error: ApiErrorPayload };

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => null)) as
      | { success: true; data: T; meta?: Record<string, unknown> }
      | { success: false; error: ApiErrorPayload }
      | null;

    if (!body) {
      return {
        ok: false,
        error: { code: 'NETWORK_ERROR', message: '서버 응답을 처리할 수 없습니다.' },
      };
    }

    if (body.success) {
      return { ok: true, data: body.data, meta: body.meta };
    }
    return { ok: false, error: body.error };
  } catch {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      },
    };
  }
}
