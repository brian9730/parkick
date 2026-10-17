import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) return _next(error);
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError(400, 'INVALID_INPUT', '입력값의 형식을 확인해주세요.');
  } else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', '요청 본문의 크기가 너무 큽니다.');
  } else if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    apiError = new ApiError(400, 'INVALID_JSON', '올바른 JSON 본문을 전송해주세요.');
  } else {
    apiError = new ApiError(500, 'INTERNAL_ERROR', '요청 처리 중 오류가 발생했습니다.');
    // Deliberately exclude request bodies, URLs, credentials, cookies and raw errors.
    console.error(JSON.stringify({ event: 'api_error', requestId: response.locals.requestId, code: apiError.code }));
  }
  response.status(apiError.status).json({
    error: { code: apiError.code, message: apiError.message, requestId: response.locals.requestId },
  });
};
