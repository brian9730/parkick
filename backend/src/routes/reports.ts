import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import type { ReportController } from '../controllers/ReportController.js';
import { ApiError } from '../middleware/errors.js';
import { MAX_PHOTO_BYTES, MAX_PHOTOS } from '../services/storage/prepareEvidence.js';

export function reportRoutes(controller: ReportController): Router {
  const router = Router();
  const liveUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, fieldNameSize: 20, parts: 1, headerPairs: 20 },
  }).single('photo');
  const liveMultipart: RequestHandler = (request, response, next) => {
    if (!request.is('multipart/form-data')) {
      return next(new ApiError(415, 'MULTIPART_REQUIRED', '카메라 사진을 multipart/form-data로 보내 주세요.'));
    }
    liveUpload(request, response, error => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, 'PAYLOAD_TOO_LARGE', '카메라 사진은 2MB 이하여야 합니다.'));
      }
      next(new ApiError(400, 'INVALID_MULTIPART', '카메라 사진 한 장만 보내 주세요.'));
    });
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 1, fieldSize: 64 * 1024, fieldNameSize: 50, parts: MAX_PHOTOS + 1, headerPairs: 30 },
  }).array('photos', MAX_PHOTOS);
  const multipart: RequestHandler = (request, response, next) => {
    if (!request.is('multipart/form-data')) return next(new ApiError(415, 'MULTIPART_REQUIRED', '신고 정보와 사진을 multipart/form-data 형식으로 보내주세요.'));
    upload(request, response, error => {
      if (!error) return next();
      if (error instanceof multer.MulterError && ['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE'].includes(error.code)) {
        return next(new ApiError(413, 'PAYLOAD_TOO_LARGE', '사진 또는 신고 입력의 크기가 너무 큽니다.'));
      }
      // Do not expose parser errors or client-provided filenames.
      next(new ApiError(400, 'INVALID_MULTIPART', '신고 정보 1개와 사진 1~2장을 확인해주세요.'));
    });
  };
  router.get('/status', controller.status);
  router.post('/photo/live-guidance', rateLimit({
    windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '촬영 안내 요청이 많습니다. 잠시 후 다시 시도해 주세요.')),
  }), rateLimit({
    windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: () => 'all-camera-guidance',
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '촬영 안내 요청이 많습니다. 잠시 후 다시 시도해 주세요.')),
  }), controller.requireGuidanceConfigured, liveMultipart, controller.guidePhoto);
  router.post('/validate-photos', rateLimit({
    windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '사진 확인 요청이 많습니다. 잠시 후 다시 시도해주세요.')),
  }), multipart, controller.validatePhotos);
  router.post('/', rateLimit({
    windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    // No reverse proxy is trusted in local mode; deliberately ignore client-supplied forwarding headers.
    validate: { xForwardedForHeader: false },
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '신고 요청이 많습니다. 잠시 후 다시 시도해주세요.')),
  }), controller.requireAvailable, multipart, controller.submit);
  return router;
}
