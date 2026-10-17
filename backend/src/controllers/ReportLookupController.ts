import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import type { ReportLookupService } from '../services/reports/ReportLookupService.js';

export class ReportLookupController {
  constructor(private readonly service: ReportLookupService | null) {}

  requireAvailable: RequestHandler = (request, _response, next) => {
    if (Object.keys(request.query).length) return next(new ApiError(400, 'INVALID_INPUT', '조회 정보는 요청 본문에 입력해주세요.'));
    if (!this.service) return next(new ApiError(503, 'LOOKUP_UNAVAILABLE', '신고 조회 기능이 연결되지 않았습니다. 잠시 후 다시 시도해주세요.'));
    next();
  };

  list: RequestHandler = async (request, response) => {
    response.json({ data: await this.service!.list(request.body) });
  };

  detail: RequestHandler = async (request, response) => {
    response.json({ data: await this.service!.detail(request.params.publicId, request.body) });
  };
}
