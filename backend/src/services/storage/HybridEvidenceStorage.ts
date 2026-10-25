import { ApiError } from '../../middleware/errors.js';
import type { EvidenceRead, EvidenceStorage, EvidenceUpload, PreparedEvidence, SavedEvidence } from './EvidenceStorage.js';

type ReadableStorage = { read(objectKey: string): Promise<EvidenceRead>; close?(): void };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const LEGACY_KEY = new RegExp(`^${UUID}/${UUID}\\.jpg$`);

/** New evidence belongs to S3; previously saved local evidence remains readable by its DB key. */
export class HybridEvidenceStorage implements EvidenceStorage {
  private readonly s3Key: RegExp;

  constructor(private readonly s3: EvidenceStorage & ReadableStorage, prefix: string,
    private readonly legacy: ReadableStorage | null = null) {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) throw new Error('Invalid evidence S3 prefix');
    this.s3Key = new RegExp(`^${prefix}/${UUID}/[123]\\.jpg$`);
  }

  prepare(files: readonly EvidenceUpload[]): Promise<PreparedEvidence[]> { return this.s3.prepare(files); }
  save(prepared: readonly PreparedEvidence[]): Promise<SavedEvidence> { return this.s3.save(prepared); }
  remove(directory: string): Promise<void> { return this.s3.remove(directory); }

  async read(objectKey: string): Promise<EvidenceRead> {
    if (this.s3Key.test(objectKey)) return this.s3.read(objectKey);
    if (LEGACY_KEY.test(objectKey)) {
      if (this.legacy) return this.legacy.read(objectKey);
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '기존 사진 저장 경로를 사용할 수 없습니다.');
    }
    throw new ApiError(404, 'IMAGE_NOT_FOUND', '사진을 찾을 수 없습니다.');
  }

  close(): void {
    try { this.s3.close?.(); }
    finally { this.legacy?.close?.(); }
  }
}
