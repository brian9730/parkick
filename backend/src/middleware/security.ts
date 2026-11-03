import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import { ApiError } from './errors.js';

export const requestContext: RequestHandler = (_request, response, next) => {
  response.locals.requestId = randomUUID();
  response.setHeader('X-Request-Id', response.locals.requestId);
  response.setHeader('Cache-Control', 'no-store');
  next();
};

/** Vite advertises 127.0.0.1, while the local setup also uses localhost. */
export function trustedFrontendOrigins(config: Pick<AppConfig, 'frontendOrigin' | 'environment'>): ReadonlySet<string> {
  const origins = new Set([config.frontendOrigin]);
  if (config.environment === 'development') {
    const alias = new URL(config.frontendOrigin);
    if (alias.hostname === 'localhost' || alias.hostname === '127.0.0.1') {
      // Preserve scheme and port. Never trust arbitrary local hosts or forwarded headers.
      alias.hostname = alias.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      origins.add(alias.origin);
    }
  }
  return origins;
}

/** Strict Origin checks also protect login/logout against CSRF, including same-site siblings. */
export function requireTrustedMutation(trustedOrigins: ReadonlySet<string>): RequestHandler {
  return (request, _response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    const origin = request.get('origin');
    if (!origin || !trustedOrigins.has(origin)) {
      return next(new ApiError(403, 'UNTRUSTED_ORIGIN', '허용되지 않은 요청 출처입니다.'));
    }
    const reportUpload = request.method === 'POST'
      && ['/api/reports', '/api/reports/validate-photos', '/api/reports/photo/live-guidance'].includes(request.path)
      && request.is('multipart/form-data');
    if (!reportUpload && !request.is('application/json')) {
      return next(new ApiError(415, 'JSON_REQUIRED', 'application/json 형식으로 요청해주세요.'));
    }
    next();
  };
}
