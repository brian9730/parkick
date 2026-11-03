import { parse, serialize, type SerializeOptions } from 'cookie';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { ApiError } from '../middleware/errors.js';
import type { AdminAuthService } from '../services/admin/AdminAuthService.js';

const loginSchema = z.strictObject({ email: z.email().max(254).trim(), password: z.string().min(1).max(128) });
const COOKIE_NAME = 'parkick_admin_session';

function readToken(request: Request): string | undefined {
  return parse(request.headers.cookie ?? '')[COOKIE_NAME];
}

export class AdminAuthController {
  private readonly cookieOptions: SerializeOptions;

  constructor(private readonly service: AdminAuthService, private readonly config: AppConfig) {
    this.cookieOptions = {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.frontendOrigin.startsWith('https://') || config.environment === 'production',
      path: '/api/admin',
    };
  }

  login: RequestHandler = async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await this.service.login(input.email, input.password, readToken(request));
    response.setHeader('Set-Cookie', serialize(COOKIE_NAME, result.token, { ...this.cookieOptions, maxAge: this.config.sessionTtlMs / 1000 }));
    response.json({ data: { admin: result.admin, mode: this.service.mode } });
  };

  logout: RequestHandler = async (request, response) => {
    await this.service.logout(readToken(request));
    response.setHeader('Set-Cookie', serialize(COOKIE_NAME, '', { ...this.cookieOptions, maxAge: 0 }));
    response.status(204).end();
  };

  requireAdmin: RequestHandler = async (request, response, next) => {
    response.locals.admin = await this.service.authenticate(readToken(request));
    next();
  };

  requireManager: RequestHandler = (_request, response, next) => {
    const role = response.locals.admin?.role;
    if (role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN'
      || (this.service.mode === 'development-mock' && !role)) { next(); return; }
    next(new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.'));
  };

  requireCollector: RequestHandler = (_request, response, next) => {
    const admin = response.locals.admin;
    if (admin?.role === 'COLLECTOR' && admin.tenantId) { next(); return; }
    next(new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.'));
  };

  me: RequestHandler = (_request, response) => {
    response.json({ data: { admin: response.locals.admin, mode: this.service.mode } });
  };
}
