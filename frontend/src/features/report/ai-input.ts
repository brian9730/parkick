import type { AiReportInput } from '../../api/ai';
import type { ReportLocation } from '../map/location';
import type { ReportDraft } from './model';
import { normalizeOperatorName } from './operators';

export function buildAiReportInput(draft: ReportDraft, location: ReportLocation | null): AiReportInput {
  return {
    operator: normalizeOperatorName(draft.operator) || null,
    deviceId: draft.deviceId.trim() || null,
    address: location?.address.trim() || null,
    categories: [...draft.categories],
    additionalDescription: draft.categories.includes('기타') ? draft.additionalDescription.trim() : '',
  };
}

/** Local comparison only. Coordinates invalidate review but are never part of the AI request. */
export function reportFactsKey(draft: ReportDraft, location: ReportLocation | null): string {
  return JSON.stringify([buildAiReportInput(draft, location), location?.latitude ?? null, location?.longitude ?? null]);
}
