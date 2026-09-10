import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError, ValidationError, type FieldErrors } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * 모든 API 응답은 아래 형식을 따른다.
 *
 * 성공: { "success": true,  "data": <payload>, "meta"?: <페이징 등> }
 * 실패: { "success": false, "error": { "code": string, "message": string, "fieldErrors"?: {...} } }
 */

export type ApiMeta = {
  page?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
  [key: string]: unknown;
};

export type ApiSuccess<T> = { success: true; data: T; meta?: ApiMeta };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; fieldErrors?: FieldErrors };
};

export function apiSuccess<T>(data: T, meta?: ApiMeta, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>(
    meta ? { success: true, data, meta } : { success: true, data },
    {
      status,
    },
  );
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
  fieldErrors?: FieldErrors,
): NextResponse<ApiFailure> {
  return NextResponse.json<ApiFailure>(
    { success: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } },
    { status },
  );
}

/** ZodError -> 필드별 한국어 오류 메시지 */
export function zodErrorToFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Route Handler 공통 오류 처리.
 * 내부 오류 상세(스택/SQL/환경변수)는 절대 응답에 포함하지 않는다.
 */
export function handleApiError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    const validationError = new ValidationError(
      '입력값을 다시 확인해 주세요.',
      zodErrorToFieldErrors(error),
    );
    return apiFailure(
      validationError.code,
      validationError.message,
      validationError.status,
      validationError.fieldErrors,
    );
  }

  if (error instanceof AppError) {
    return apiFailure(error.code, error.message, error.status, error.fieldErrors);
  }

  logger.error('처리되지 않은 API 오류', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return apiFailure(
    'INTERNAL_ERROR',
    '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    500,
  );
}
