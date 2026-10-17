import type { RequestHandler } from 'express';
import type { AdminOverviewService } from '../services/admin/AdminOverviewService.js';
import { adminReportMapQuery, adminReportQuery, adminReportTransition, adminRelatedReportTransition } from '../services/admin/adminReportInput.js';

export class AdminOverviewController {
  constructor(private readonly service: AdminOverviewService) {}

  dashboard: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.getDashboard(response.locals.admin!) });
  };

  reports: RequestHandler = async (request, response) => {
    const query = adminReportQuery.parse(request.query);
    response.json({ data: await this.service.getReports(response.locals.admin!, query) });
  };

  map: RequestHandler = async (request, response) => {
    const query = adminReportMapQuery.parse(request.query);
    response.json({ data: await this.service.getMap(response.locals.admin!, query) });
  };

  detail: RequestHandler = async (request, response) => {
    response.json({ data: await this.service.detail(response.locals.admin!, String(request.params.publicId)) });
  };

  transition: RequestHandler = async (request, response) => {
    const input = adminReportTransition.parse(request.body);
    response.json({ data: await this.service.transition(response.locals.admin!, String(request.params.publicId), input) });
  };

  related: RequestHandler = async (request, response) => {
    response.json({ data: await this.service.related(response.locals.admin!, String(request.params.publicId)) });
  };

  transitionRelated: RequestHandler = async (request, response) => {
    const input = adminRelatedReportTransition.parse(request.body);
    response.json({ data: await this.service.transitionRelated(response.locals.admin!, String(request.params.publicId), input) });
  };

  image: RequestHandler = async (request, response) => {
    const photo = await this.service.image(response.locals.admin!, String(request.params.publicId), String(request.params.imageId));
    response.setHeader('Cache-Control', 'no-store');
    if ('redirect' in photo) { response.redirect(302, photo.redirect); return; }
    response.type('image/jpeg').setHeader('Content-Disposition', 'inline');
    response.send(photo.buffer);
  };
}
