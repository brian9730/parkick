import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { QRController } from '../controllers/QRController.js';
import { ApiError } from '../middleware/errors.js';

export function qrRoutes(controller: QRController): Router {
  const router = Router();
  const parseLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'QR 확인 요청이 많습니다. 잠시 후 다시 시도하거나 직접 입력해주세요.')),
  });
  router.post('/parse', parseLimiter, controller.parse);
  return router;
}
