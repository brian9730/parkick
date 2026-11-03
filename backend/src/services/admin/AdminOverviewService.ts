import type { AdminOverviewRepository } from '../../repositories/AdminOverviewRepository.js';
import type { AdminReportRepository } from '../../repositories/AdminReportRepository.js';
import type { EvidenceStorage } from '../storage/EvidenceStorage.js';
import type { AdminProfile } from '../../types/admin.js';
import { ApiError } from '../../middleware/errors.js';
import { reportScope, type AdminNearbyReportQuery, type AdminReportHotspotQuery, type AdminReportMapQuery, type AdminReportQuery, type AdminReportScope, type AdminReportTransition, type AdminRelatedReportTransition, type CollectorCompletion, type CollectorMissing } from './adminReportInput.js';

export class AdminOverviewService {
  constructor(private readonly repository: AdminOverviewRepository, private readonly reports: AdminReportRepository | null = null, private readonly storage: EvidenceStorage | null = null) {}

  getDashboard(admin: AdminProfile) {
    this.assertManager(admin);
    const scope = reportScope(admin);
    return scope ? this.run(repository => repository.dashboard(scope)) : this.repository.getDashboard();
  }

  getReports(admin: AdminProfile, query: AdminReportQuery) {
    this.assertManager(admin);
    const scope = reportScope(admin);
    return scope ? this.run(repository => repository.list(scope, query)) : this.repository.getReports(query.page, query.pageSize);
  }

  getMap(admin: AdminProfile, query: AdminReportMapQuery) {
    this.assertManager(admin);
    const scope = reportScope(admin);
    return scope ? this.run(repository => repository.map(scope, query)) : this.repository.getReports(query.page, query.pageSize);
  }

  getHotspots(admin: AdminProfile, query: AdminReportHotspotQuery) {
    this.assertManager(admin);
    const scope = reportScope(admin);
    return scope ? this.run(repository => repository.hotspots(scope, query))
      : Promise.resolve({ mode: 'skeleton' as const, zones: [], totalReports: 0 });
  }

  getNearby(admin: AdminProfile, query: AdminNearbyReportQuery) {
    this.assertManager(admin);
    const scope = reportScope(admin);
    return scope ? this.run(repository => repository.nearby(scope, query)) : this.repository.getReports(query.page, query.pageSize);
  }

  detail(admin: AdminProfile, publicId: string) {
    const scope = this.requireScope(admin);
    return this.run(repository => repository.detail(scope, publicId));
  }

  transition(admin: AdminProfile, publicId: string, input: AdminReportTransition) {
    const scope = this.requireScope(admin);
    return this.run(repository => repository.transition(scope, publicId, input));
  }

  related(admin: AdminProfile, publicId: string) {
    const scope = this.requireScope(admin);
    return this.run(repository => repository.related(scope, publicId));
  }

  transitionRelated(admin: AdminProfile, publicId: string, input: AdminRelatedReportTransition) {
    const scope = this.requireScope(admin);
    return this.run(repository => repository.transitionRelated(scope, publicId, input));
  }

  async image(admin: AdminProfile, publicId: string, imageId: string) {
    const scope = this.requireScope(admin);
    // Resolve report ownership and image membership before any filesystem read or S3 signing.
    const image = await this.run(repository => repository.image(scope, publicId, imageId));
    if (!this.storage?.read) throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    try { return await this.storage.read(image.objectKey); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  collectionMap(admin: AdminProfile, query: AdminReportMapQuery) {
    const scope = this.requireCollectorScope(admin);
    return this.run(repository => repository.collectionMap(scope, query));
  }

  collectionNearby(admin: AdminProfile, query: AdminNearbyReportQuery) {
    const scope = this.requireCollectorScope(admin);
    return this.run(repository => repository.nearby(scope, query));
  }

  collectionDetail(admin: AdminProfile, publicId: string) {
    const scope = this.requireCollectorScope(admin);
    return this.run(repository => repository.collectionDetail(scope, publicId));
  }

  collectionComplete(admin: AdminProfile, publicId: string, input: CollectorCompletion) {
    const scope = this.requireCollectorScope(admin);
    return this.run(repository => repository.collectionComplete(scope, publicId, input));
  }

  collectionMissing(admin: AdminProfile, publicId: string, input: CollectorMissing) {
    const scope = this.requireCollectorScope(admin);
    return this.run(repository => repository.collectionMissing(scope, publicId, input));
  }

  async collectionImage(admin: AdminProfile, publicId: string, imageId: string) {
    const scope = this.requireCollectorScope(admin);
    const image = await this.run(repository => repository.collectionImage(scope, publicId, imageId));
    if (!this.storage?.read) throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    try { return await this.storage.read(image.objectKey); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  private requireCollectorScope(admin: AdminProfile): AdminReportScope {
    const scope = reportScope(admin);
    if (!scope || scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    return scope;
  }

  private requireScope(admin: AdminProfile): AdminReportScope {
    this.assertManager(admin);
    const scope = reportScope(admin);
    if (!scope) throw new ApiError(501, 'PHASE_NOT_IMPLEMENTED', '실제 신고 관리는 데이터베이스 관리자 계정으로 이용해주세요.');
    return scope;
  }

  private assertManager(admin: AdminProfile): void {
    if (admin.role === 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  }

  private async run<T>(operation: (repository: AdminReportRepository) => Promise<T>): Promise<T> {
    if (!this.reports) throw new ApiError(503, 'ADMIN_REPORTS_UNAVAILABLE', '신고 관리를 잠시 사용할 수 없습니다.');
    try { return await operation(this.reports); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'ADMIN_REPORTS_UNAVAILABLE', '신고 관리를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}
