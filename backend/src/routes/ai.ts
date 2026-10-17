import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AIController } from '../controllers/AIController.js';
import { ApiError } from '../middleware/errors.js';

export function aiRoutes(controller: AIController): Router {
  const router = Router();
  router.get('/status', controller.status);
  router.post('/generate-report', rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '신고문 작성 요청이 많습니다. 잠시 후 다시 시도하거나 직접 작성해주세요.')),
  }), controller.generate);
  return router;
}
