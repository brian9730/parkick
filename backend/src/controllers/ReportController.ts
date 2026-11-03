import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import type { ReportSubmissionService } from '../services/reports/ReportSubmissionService.js';
import type { PhotoValidator } from '../services/reports/PhotoValidationService.js';
import type { PhotoGuider } from '../services/reports/PhotoGuidanceService.js';
import { prepareEvidence } from '../services/storage/prepareEvidence.js';

export class ReportController {
  constructor(private readonly service: ReportSubmissionService | null,
    private readonly photoValidator: PhotoValidator, private readonly mode: 'local' | 's3' = 'local',
    private readonly photoGuider?: PhotoGuider) {}

  status: RequestHandler = async (_request, response) => {
    response.json({ data: {
      available: await this.service?.isAvailable() ?? false,
      mode: this.service ? this.mode : 'disabled',
      photoValidation: this.photoValidator.mode,
    } });
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

  validatePhotos: RequestHandler = async (request, response) => {
    if (!request.body || typeof request.body !== 'object' || Object.keys(request.body).length !== 0) {
      throw new ApiError(400, 'INVALID_INPUT', '사진만 첨부해주세요.');
    }
    const prepared = await prepareEvidence(Array.isArray(request.files) ? request.files : []);
    await this.photoValidator.validate(prepared);
    response.json({ data: { valid: true, photoValidation: this.photoValidator.mode } });
  };

  requireGuidanceConfigured: RequestHandler = (_request, _response, next) => {
    if (!this.photoGuider?.configured) {
      return next(new ApiError(503, 'PHOTO_GUIDANCE_UNAVAILABLE', '촬영 안내를 잠시 사용할 수 없습니다. 사진을 촬영한 뒤 확인해 주세요.'));
    }
    next();
  };

  guidePhoto: RequestHandler = async (request, response) => {
    if (!request.body || typeof request.body !== 'object' || Object.keys(request.body).length !== 0 || !request.file) {
      throw new ApiError(400, 'INVALID_INPUT', '카메라 사진 한 장만 보내 주세요.');
    }
    const abortController = new AbortController();
    const onClose = () => { if (!response.writableEnded) abortController.abort(); };
    response.once('close', onClose);
    try {
      // Browser camera frames are deliberately smaller than final report evidence.
      const [photo] = await prepareEvidence([request.file], { maxPixels: 2_000_000 });
      if (abortController.signal.aborted) return;
      const result = await this.photoGuider!.guide(photo!, abortController.signal);
      if (!response.destroyed) response.json({ data: result });
    } catch (error) {
      if (!abortController.signal.aborted) throw error;
    } finally {
      response.off('close', onClose);
    }
  };
}
