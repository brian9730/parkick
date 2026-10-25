import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { ReportConfig } from '../../config.js';
import { ApiError } from '../../middleware/errors.js';
import { ReportRepositoryError } from '../../repositories/ReportRepository.js';
import type { ReportRepository, StoredReport } from '../../repositories/ReportRepository.js';
import { protectContact } from './phone.js';
import { reportSubmissionSchema, reportSummary } from './reportInput.js';
import type { ReportFacts, ReportReceipt } from './reportInput.js';
import type { EvidenceUpload, EvidenceStorage } from '../storage/EvidenceStorage.js';
import type { PhotoValidator } from './PhotoValidationService.js';

function unavailable(): ApiError { return new ApiError(503, 'REPORT_UNAVAILABLE', '신고를 저장하지 못했습니다. 입력 내용은 유지되니 잠시 후 다시 시도해주세요.'); }
function sameSubmission(existing: StoredReport, hashes: readonly string[]): { receipt: ReportReceipt; replayed: boolean } {
  if (!hashes.includes(existing.submissionHash)) throw new ApiError(409, 'SUBMISSION_CONFLICT', '이미 접수된 요청의 내용이 변경되었습니다. 접수 결과를 확인하거나 새 신고를 시작해주세요.');
  return { receipt: existing.receipt, replayed: true };
}

export class ReportSubmissionService {
  constructor(private readonly config: ReportConfig, private readonly repository: ReportRepository,
    private readonly storage: EvidenceStorage, readonly photoValidator: PhotoValidator) {}

  async isAvailable(): Promise<boolean> {
    try { return await this.repository.isAvailable(this.config.regionCode); }
    catch { return false; }
  }

  async submit(payload: unknown, files: readonly EvidenceUpload[]): Promise<{ receipt: ReportReceipt; replayed: boolean }> {
    const input = reportSubmissionSchema.parse(payload);
    const photos = await this.storage.prepare(files);
    const now = new Date();
    const contact = protectContact(input.phone, this.config.encryptionKey, this.config.lookupKey, now);
    const facts: ReportFacts = {
      submissionId: input.submissionId, operator: input.operator, deviceId: input.deviceId, qrRawData: input.qrRawData,
      latitude: input.latitude, longitude: input.longitude, address: input.address,
      categories: [...input.categories].sort(), additionalDescription: input.additionalDescription,
      finalReportText: reportSummary(input),
    };
    const hashFacts = (operator: string | null, finalReportText = facts.finalReportText) => createHmac('sha256', this.config.lookupKey).update('parkick-submission-v1\0')
      .update(JSON.stringify({ facts: { ...facts, operator, finalReportText }, phoneIdentifier: contact.phoneIdentifier, photos: photos.map(photo => photo.sourceHash) })).digest('hex');
    const hash = hashFacts(input.operator);
    // Validation above guarantees this original field is a string or null.
    // An unchanged retry of an older alias-based report must still match its
    // original hash. Only the operator normalization differs; all other facts,
    // contact and original photo hashes must match exactly.
    const originalOperator = (payload as { operator: string | null }).operator?.trim() || null;
    const acceptedHashes = new Set([hash, hashFacts(originalOperator)]);
    if (input.finalReportText) {
      acceptedHashes.add(hashFacts(input.operator, input.finalReportText));
      acceptedHashes.add(hashFacts(originalOperator, input.finalReportText));
    }
    let existing: StoredReport | null;
    try { existing = await this.repository.findBySubmissionId(input.submissionId); }
    catch { throw unavailable(); }
    if (existing) return sameSubmission(existing, [...acceptedHashes]);

    // Old nullable identifiers are accepted only for an identical retry, never for new reports.
    if (!input.operator || !input.deviceId
      || /^(?:업체\s*)?확인\s*불가$/.test(input.operator)
      || /^(?:기기번호\s*)?확인\s*불가$/.test(input.deviceId)) {
      throw new ApiError(400, 'IDENTITY_REQUIRED', '업체를 선택하고 기기번호를 입력해주세요.');
    }
    await this.photoValidator.validate(photos);

    const saved = await this.storage.save(photos);
    const id = randomUUID();
    let retainFiles = false;
    try {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/\D/g, '');
      const stored = await this.repository.create({
        id, publicId: `PK-${date}-${randomBytes(6).toString('hex')}`, submissionHash: hash, createdAt: now,
        regionCode: this.config.regionCode, facts, contact, images: saved.images,
      });
      retainFiles = true;
      return { receipt: stored.receipt, replayed: false };
    } catch (error) {
      try {
        const committed = await this.repository.findBySubmissionId(input.submissionId);
        if (committed) {
          retainFiles = committed.id === id;
          return sameSubmission(committed, [...acceptedHashes]);
        }
      } catch (lookupError) {
        if (lookupError instanceof ApiError) throw lookupError;
        // If a commit acknowledgement was lost and the DB is still down, preserve possible committed evidence.
        // A retry with the same submission ID reconciles the report once the database is available again.
        if (!(error instanceof ReportRepositoryError) || error.kind === 'uncertain') {
          retainFiles = true;
          console.error(JSON.stringify({ event: 'report_commit_unconfirmed' }));
        }
      }
      throw unavailable();
    } finally {
      if (!retainFiles) await this.storage.remove(saved.directory);
    }
  }
}
