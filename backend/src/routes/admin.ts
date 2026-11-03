import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AdminAuthController } from '../controllers/AdminAuthController.js';
import type { AdminOverviewController } from '../controllers/AdminOverviewController.js';
import type { CollectionController } from '../controllers/CollectionController.js';
import { ApiError } from '../middleware/errors.js';

export function adminRoutes(auth: AdminAuthController, overview: AdminOverviewController, collection: CollectionController): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.')),
  });
  router.post('/auth/login', loginLimiter, auth.login);
  // Idempotent logout clears stale cookies too. Origin validation still applies.
  router.post('/auth/logout', auth.logout);
  router.use(auth.requireAdmin);
  router.get('/auth/me', auth.me);
  router.use('/collection', auth.requireCollector);
  router.get('/collection/reports/nearby', collection.nearby);
  router.get('/collection/reports/map', collection.map);
  router.get('/collection/reports/:publicId', collection.detail);
  router.get('/collection/reports/:publicId/images/:imageId', collection.image);
  router.patch('/collection/reports/:publicId/complete', collection.complete);
  router.post('/collection/reports/:publicId/missing', collection.missing);
  router.use(auth.requireManager);
  router.get('/dashboard', overview.dashboard);
  router.get('/reports', overview.reports);
  router.get('/reports/map', overview.map);
  router.get('/reports/hotspots', overview.hotspots);
  router.get('/reports/nearby', overview.nearby);
  router.get('/reports/:publicId/related', overview.related);
  router.patch('/reports/:publicId/related/status', overview.transitionRelated);
  router.get('/reports/:publicId', overview.detail);
  router.get('/reports/:publicId/images/:imageId', overview.image);
  router.patch('/reports/:publicId/status', overview.transition);
  return router;
}
