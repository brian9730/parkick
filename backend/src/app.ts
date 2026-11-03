import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { assertProductionReportConfig, type AppConfig } from './config.js';
import { AdminAuthController } from './controllers/AdminAuthController.js';
import { AdminOverviewController } from './controllers/AdminOverviewController.js';
import { CollectionController } from './controllers/CollectionController.js';
import { QRController } from './controllers/QRController.js';
import { AIController } from './controllers/AIController.js';
import { ReportController } from './controllers/ReportController.js';
import { ReportLookupController } from './controllers/ReportLookupController.js';
import { ApiError, errorHandler, notFound } from './middleware/errors.js';
import { requestContext, requireTrustedMutation, trustedFrontendOrigins } from './middleware/security.js';
import { EmptyAdminOverviewRepository } from './repositories/AdminOverviewRepository.js';
import { adminRoutes } from './routes/admin.js';
import { qrRoutes } from './routes/qr.js';
import { aiRoutes } from './routes/ai.js';
import { reportRoutes } from './routes/reports.js';
import { reportLookupRoutes } from './routes/reportLookup.js';
import { chatRoutes } from './routes/chat.js';
import { AdminAuthService } from './services/admin/AdminAuthService.js';
import { AdminOverviewService } from './services/admin/AdminOverviewService.js';
import { QRParsingService } from './services/qr/QRParsingService.js';
import { ReportTextGenerator } from './services/ai/ReportTextGenerator.js';
import type { AIServiceOptions } from './services/ai/ReportTextGenerator.js';
import { PrismaReportRepository } from './repositories/ReportRepository.js';
import type { ReportRepository } from './repositories/ReportRepository.js';
import { LocalEvidenceStorage } from './services/storage/LocalEvidenceStorage.js';
import { S3EvidenceStorage } from './services/storage/S3EvidenceStorage.js';
import { HybridEvidenceStorage } from './services/storage/HybridEvidenceStorage.js';
import type { EvidenceStorage } from './services/storage/EvidenceStorage.js';
import { ReportSubmissionService } from './services/reports/ReportSubmissionService.js';
import { PhotoValidationService, type PhotoValidator } from './services/reports/PhotoValidationService.js';
import { PhotoGuidanceService, type PhotoGuider } from './services/reports/PhotoGuidanceService.js';
import type { LiteLlmSender } from './services/reports/LiteLlmPhotoClient.js';
import { ReportLookupService } from './services/reports/ReportLookupService.js';
import { PrismaReportLookupRepository } from './repositories/ReportLookupRepository.js';
import { ChatService } from './services/chatbot/ChatService.js';
import type { ChatFetch } from './services/chatbot/GatewayChatProvider.js';
import type { ReportLookupRepository } from './repositories/ReportLookupRepository.js';
import type { AdminAuthRepositories } from './repositories/PrismaAdminAuthRepository.js';
import { PrismaAdminReportRepository, type AdminReportRepository } from './repositories/AdminReportRepository.js';

export interface AppOptions extends AIServiceOptions {
  reportRepository?: ReportRepository;
  reportStorage?: EvidenceStorage;
  reportLookupRepository?: ReportLookupRepository;
  adminAuthRepositories?: AdminAuthRepositories;
  adminReportRepository?: AdminReportRepository;
  photoValidator?: PhotoValidator;
  photoGuider?: PhotoGuider;
  liteLlmSender?: LiteLlmSender;
  chatFetch?: ChatFetch;
}

export async function createApp(config: AppConfig, options: AppOptions = {}) {
  assertProductionReportConfig(config);
  const app = express();
  app.disable('x-powered-by');
  // Only the local Nginx peer may supply client IPs; Nginx must overwrite forwarded headers.
  app.set('trust proxy', config.trustProxy ?? false);
  app.use(requestContext);
  app.use(helmet());
  const trustedOrigins = trustedFrontendOrigins(config);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || trustedOrigins.has(origin)) callback(null, true);
      else callback(new ApiError(403, 'UNTRUSTED_ORIGIN', '허용되지 않은 요청 출처입니다.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }));
  app.use(requireTrustedMutation(trustedOrigins));
  app.use(express.json({ limit: '16kb' }));
  // The old text endpoint is retained only for local compatibility. Production Bedrock is for evidence validation.
  const generator = config.environment === 'production' ? new ReportTextGenerator(null) : ReportTextGenerator.create(config, options);
  const photoValidator = options.photoValidator ?? PhotoValidationService.create(config, options.bedrockSender, options.timeoutMs, options.liteLlmSender);
  const photoGuider = options.photoGuider ?? PhotoGuidanceService.create(config, options.bedrockSender, options.timeoutMs, options.liteLlmSender);
  const repository = config.reports ? options.reportRepository ?? new PrismaReportRepository(config.reports.databaseUrl) : null;
  const lookupRepository = config.reports ? options.reportLookupRepository ?? new PrismaReportLookupRepository(config.reports.databaseUrl) : null;
  const lookupService = config.reports && lookupRepository ? new ReportLookupService(config.reports.lookupKey, lookupRepository) : null;
  const storageMode = config.reports?.storage?.mode ?? 'local';
  const storage: EvidenceStorage | null = config.reports ? options.reportStorage ?? (config.reports.storage?.mode === 's3'
    ? new HybridEvidenceStorage(new S3EvidenceStorage(config.reports.storage), config.reports.storage.prefix,
      config.reports.legacyStorageDir ? new LocalEvidenceStorage(config.reports.legacyStorageDir) : null)
    : new LocalEvidenceStorage(config.reports.storageDir)) : null;
  const reportService = config.reports && repository && storage ? new ReportSubmissionService(config.reports, repository, storage, photoValidator) : null;
  app.get('/api/health', (_request, response) => {
    response.json({ data: {
      status: 'ok', phase: 5, mode: config.environment,
      services: { database: repository ? 'configured' : 'not-connected', ai: generator.status().mode,
        photoValidation: photoValidator.mode, storage: reportService ? `private-${storageMode}` : 'not-connected' },
    } });
  });
  const authService = await AdminAuthService.create(config, options.adminAuthRepositories);
  const auth = new AdminAuthController(authService, config);
  const adminReports = config.reports && authService.mode === 'database'
    ? options.adminReportRepository ?? new PrismaAdminReportRepository(config.reports.databaseUrl) : null;
  const adminOverviewService = new AdminOverviewService(new EmptyAdminOverviewRepository(), adminReports, storage);
  const overview = new AdminOverviewController(adminOverviewService);
  const collection = new CollectionController(adminOverviewService);
  app.use('/api/admin', adminRoutes(auth, overview, collection));
  app.use('/api/qr', qrRoutes(new QRController(new QRParsingService())));
  app.use('/api/ai', aiRoutes(new AIController(generator)));
  app.use('/api/chat', chatRoutes(new ChatService(config.chatbot, { chatFetch: options.chatFetch })));
  app.use('/api/reports/lookup', reportLookupRoutes(new ReportLookupController(lookupService)));
  app.use('/api/reports', reportRoutes(new ReportController(reportService, photoValidator, storageMode, photoGuider)));
  app.use(notFound);
  app.use(errorHandler);
  return Object.assign(app, { closeResources: async () => {
    try { await repository?.close(); }
    finally {
      try { await lookupRepository?.close(); }
      finally {
        try { await authService.close(); }
        finally { try { await adminReports?.close(); } finally { storage?.close?.(); } }
      }
    }
  } });
}
