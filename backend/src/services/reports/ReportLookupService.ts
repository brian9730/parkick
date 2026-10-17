import { createHmac } from 'node:crypto';
import { normalizeOperatorName } from '../../catalog/operators.js';
import { ApiError } from '../../middleware/errors.js';
import type { ReportLookupIdentity, ReportLookupRepository } from '../../repositories/ReportLookupRepository.js';
import {
  PHONE_LOOKUP_KEY_VERSION, REPORT_LOOKUP_MAX_PAGE, REPORT_LOOKUP_PAGE_SIZE,
  reportLookupDetailSchema, reportLookupListSchema, reportPublicIdSchema,
} from './reportLookupInput.js';
import type { PublicReportDetail, PublicReportList, PublicReportSummary } from './reportLookupInput.js';

function unavailable(): ApiError {
  return new ApiError(503, 'LOOKUP_UNAVAILABLE', '신고 내역을 조회하지 못했습니다. 잠시 후 다시 시도해주세요.');
}
function notFound(): ApiError {
  return new ApiError(404, 'REPORT_NOT_FOUND', '입력한 전화번호로 해당 신고를 찾을 수 없습니다.');
}
function publicSummary(row: PublicReportSummary): PublicReportSummary {
  // Rebuild the response instead of spreading a record that may later gain private fields.
  return {
    publicId: row.publicId, createdAt: row.createdAt, operatorName: normalizeOperatorName(row.operatorName),
    categories: [...row.categories], status: row.status,
    completionMethod: row.completionMethod, completedAt: row.completedAt,
  };
}

/** A phone-number match is a search condition, not identity verification or authentication. */
export class ReportLookupService {
  constructor(private readonly lookupKey: Buffer, private readonly repository: ReportLookupRepository) {}

  private identity(phone: string): ReportLookupIdentity {
    // Must remain identical to protectContact's versioned identifier for existing submissions.
    return {
      phoneIdentifier: createHmac('sha256', this.lookupKey).update(`parkick-phone-v1\0${phone}`).digest('hex'),
      phoneHmacKeyVersion: PHONE_LOOKUP_KEY_VERSION,
    };
  }

  async list(payload: unknown): Promise<PublicReportList> {
    const { phone, page } = reportLookupListSchema.parse(payload);
    let rows: PublicReportSummary[];
    try { rows = await this.repository.list(this.identity(phone), page); }
    catch { throw unavailable(); }
    return {
      items: rows.slice(0, REPORT_LOOKUP_PAGE_SIZE).map(publicSummary),
      page, pageSize: REPORT_LOOKUP_PAGE_SIZE, hasMore: page < REPORT_LOOKUP_MAX_PAGE && rows.length > REPORT_LOOKUP_PAGE_SIZE,
    };
  }

  async detail(publicId: unknown, payload: unknown): Promise<PublicReportDetail> {
    const { phone } = reportLookupDetailSchema.parse(payload);
    const parsedId = reportPublicIdSchema.safeParse(publicId);
    if (!parsedId.success) throw notFound();
    let row: PublicReportDetail | null;
    try { row = await this.repository.detail(this.identity(phone), parsedId.data); }
    catch { throw unavailable(); }
    if (!row) throw notFound();
    return {
      ...publicSummary(row),
      history: row.history.map(event => ({
        status: event.status, createdAt: event.createdAt, completionMethod: event.completionMethod, publicNote: event.publicNote,
      })),
    };
  }
}
