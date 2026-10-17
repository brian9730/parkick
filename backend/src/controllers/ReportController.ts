import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import type { ReportSubmissionService } from '../services/reports/ReportSubmissionService.js';

export class ReportController {
  constructor(private readonly service: ReportSubmissionService | null, private readonly mode: 'local' | 's3' = 'local') {}

  status: RequestHandler = async (_request, response) => {
    response.json({ data: { available: await this.service?.isAvailable() ?? false, mode: this.service ? this.mode : 'disabled' } });
  };

  requireAvailable: RequestHandler = (_request, _response, next) => {
    if (!this.service) return next(new ApiError(503, 'REPORT_UNAVAILABLE', '신고 저장 기능이 연결되지 않았습니다. 입력 내용은 현재 화면에 유지됩니다.'));
    next();
  };

  submit: RequestHandler = async (request, response) => {
    if (!this.service) throw new ApiError(503, 'REPORT_UNAVAILABLE', '신고 저장 기능이 연결되지 않았습니다.');
    if (!request.body || typeof request.body !== 'object' || Object.keys(request.body).length !== 1 || typeof request.body.report !== 'string') {
      throw new ApiError(400, 'INVALID_INPUT', '신고 입력 형식을 확인해주세요.');
    }
    let input: unknown;
    try { input = JSON.parse(request.body.report); }
    catch { throw new ApiError(400, 'INVALID_JSON', '신고 입력 형식을 확인해주세요.'); }
    const files = Array.isArray(request.files) ? request.files : [];
    const result = await this.service.submit(input, files);
    if (!response.destroyed) response.status(result.replayed ? 200 : 201).json({ data: result.receipt });
  };
}
