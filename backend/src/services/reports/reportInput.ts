import { z } from 'zod';
import { normalizeOperatorName } from '../../catalog/operators.js';

export const REPORT_CATEGORIES = ['보행로 통행 방해', '횡단보도 주변', '점자블록 위', '건물 출입구', '버스정류장 주변', '차도', '자전거도로', '킥보드가 넘어져 있음', '여러 대의 PM이 통행을 방해함', '기타'] as const;
const text = (max: number) => z.string().max(max).trim().refine(value => !value.includes('\0'));
const optionalText = (max: number) => text(max).nullable().transform(value => value || null);

export const reportSubmissionSchema = z.strictObject({
  submissionId: z.uuid(),
  operator: optionalText(80).transform(normalizeOperatorName),
  deviceId: optionalText(100),
  // QR text is preserved exactly, including whitespace; it is never fetched or executed.
  qrRawData: z.string().max(4096).refine(value => !value.includes('\0')).nullable(),
  latitude: z.number().finite().min(-90).max(90).transform(value => Number(value.toFixed(6))),
  longitude: z.number().finite().min(-180).max(180).transform(value => Number(value.toFixed(6))),
  address: optionalText(300),
  categories: z.array(z.enum(REPORT_CATEGORIES)).min(1).max(10).refine(values => new Set(values).size === values.length),
  additionalDescription: text(500),
  finalReportText: text(2000).refine(value => value.length > 0),
  phone: z.string().max(13).trim().nullable()
    .refine(value => !value || /^(?:010\d{8}|010-\d{4}-\d{4})$/.test(value))
    .transform(value => value ? value.replace(/-/g, '') : null),
  consent: z.boolean(),
  reportConfirmed: z.literal(true),
}).refine(value => !value.phone || value.consent, { path: ['consent'] })
  .refine(value => !value.categories.includes('기타') || value.additionalDescription.length > 0, { path: ['additionalDescription'] });

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;
export type ReportFacts = Omit<ReportSubmission, 'phone' | 'consent' | 'reportConfirmed'>;

export interface ReportReceipt {
  publicId: string;
  status: 'RECEIVED';
  createdAt: string;
  address: string | null;
  latitude: number;
  longitude: number;
  hasContact: boolean;
}
