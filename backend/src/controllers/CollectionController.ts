import type { RequestHandler } from 'express';
import type { AdminOverviewService } from '../services/admin/AdminOverviewService.js';
import { adminNearbyReportQuery, adminReportMapQuery, collectorCompletion, collectorMissing } from '../services/admin/adminReportInput.js';

export class CollectionController {
  constructor(private readonly service: AdminOverviewService) {}

  nearby: RequestHandler = async (request, response) => {
    const query = adminNearbyReportQuery.parse(request.query);
    response.json({ data: await this.service.collectionNearby(response.locals.admin!, query) });
  };

  map: RequestHandler = async (request, response) => {
    const query = adminReportMapQuery.parse(request.query);
    response.json({ data: await this.service.collectionMap(response.locals.admin!, query) });
  };

  detail: RequestHandler = async (request, response) => {
    response.json({ data: await this.service.collectionDetail(response.locals.admin!, String(request.params.publicId)) });
  };

  complete: RequestHandler = async (request, response) => {
    const input = collectorCompletion.parse(request.body);
    response.json({ data: await this.service.collectionComplete(response.locals.admin!, String(request.params.publicId), input) });
  };

  missing: RequestHandler = async (request, response) => {
    const input = collectorMissing.parse(request.body);
    response.json({ data: await this.service.collectionMissing(response.locals.admin!, String(request.params.publicId), input) });
  };

  image: RequestHandler = async (request, response) => {
    const photo = await this.service.collectionImage(response.locals.admin!, String(request.params.publicId), String(request.params.imageId));
    response.setHeader('Cache-Control', 'no-store');
    if ('redirect' in photo) { response.redirect(302, photo.redirect); return; }
    response.type('image/jpeg').setHeader('Content-Disposition', 'inline');
    response.send(photo.buffer);
  };
}
