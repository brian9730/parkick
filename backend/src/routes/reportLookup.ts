import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ReportLookupController } from '../controllers/ReportLookupController.js';
import { ApiError } from '../middleware/errors.js';

export function reportLookupRoutes(controller: ReportLookupController): Router {
  const router = Router();
  // One budget is shared by list and detail, so alternating endpoints cannot bypass it.
  const limiter = rateLimit({
    windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '조회 요청이 많습니다. 잠시 후 다시 시도해주세요.')),
  });
  router.post('/', limiter, controller.requireAvailable, controller.list);
  router.post('/:publicId', limiter, controller.requireAvailable, controller.detail);
  return router;
}
