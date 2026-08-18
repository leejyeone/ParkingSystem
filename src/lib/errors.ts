/**
 * 애플리케이션 공통 오류 정의.
 *
 * API 응답에는 아래 code / message 만 노출한다.
 * SQL, 스택 트레이스, 환경변수, 토큰 값은 절대 응답에 포함하지 않는다.
 */

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;

  constructor(code: string, message: string, status: number, fieldErrors?: FieldErrors) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** 입력값 검증 실패 (400) */
export class ValidationError extends AppError {
  constructor(message = '입력값을 다시 확인해 주세요.', fieldErrors?: FieldErrors) {
    super('VALIDATION_ERROR', message, 400, fieldErrors);
    this.name = 'ValidationError';
  }
}

/** 인증 필요 (401) */
export class UnauthorizedError extends AppError {
  constructor(message = '로그인이 필요합니다.') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

/** 권한 없음 (403) */
export class ForbiddenError extends AppError {
  constructor(message = '접근 권한이 없습니다.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

/** 대상 없음 (404) */
export class NotFoundError extends AppError {
  constructor(message = '요청하신 정보를 찾을 수 없습니다.') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

/** 비즈니스 규칙 충돌 (409) */
export class ConflictError extends AppError {
  constructor(message = '요청을 처리할 수 없는 상태입니다.', code = 'CONFLICT') {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

/** 허용되지 않은 상태 전이 (409) */
export class InvalidStateTransitionError extends ConflictError {
  constructor(message = '현재 상태에서는 처리할 수 없는 요청입니다.') {
    super(message, 'INVALID_STATE_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

/** 요청 과다 / 잠금 (429) */
export class TooManyRequestsError extends AppError {
  constructor(message = '잠시 후 다시 시도해 주세요.') {
    super('TOO_MANY_REQUESTS', message, 429);
    this.name = 'TooManyRequestsError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
