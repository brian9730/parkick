import { createHash } from 'node:crypto';
import { findOperator } from '../../catalog/operators.js';
import type { AdminRelatedReportTransition } from './adminReportInput.js';

export const RELATED_CRITERIA = { distanceMeters: 100, timeWindowHours: 24, maxSelection: 100 } as const;
export const RELATED_SCAN_LIMIT = 1000;
export const RELATED_WINDOW_MS = RELATED_CRITERIA.timeWindowHours * 60 * 60 * 1000;

export interface RelatedFacts {
  publicId: string; tenantId: string; regionId: string; operatorName: string | null; deviceId: string | null;
  latitude: number; longitude: number; createdAt: Date;
}

export function deviceIdentity(value: string | null): string | null {
  return value?.replace(/\s/g, '').toUpperCase() || null;
}

export function knownIdentity(row: Pick<RelatedFacts, 'operatorName' | 'deviceId'>): { operatorId: string; deviceId: string } | null {
  const operator = row.operatorName === null ? null : findOperator(row.operatorName);
  const deviceId = deviceIdentity(row.deviceId);
  return operator && deviceId ? { operatorId: operator.id, deviceId } : null;
}

export function sameIdentity(anchor: Pick<RelatedFacts, 'operatorName' | 'deviceId'>, candidate: Pick<RelatedFacts, 'operatorName' | 'deviceId'>): boolean {
  const left = knownIdentity(anchor); const right = knownIdentity(candidate);
  return !!left && !!right && left.operatorId === right.operatorId && left.deviceId === right.deviceId;
}

export function distanceMeters(left: Pick<RelatedFacts, 'latitude' | 'longitude'>, right: Pick<RelatedFacts, 'latitude' | 'longitude'>): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(right.latitude - left.latitude);
  const longitude = radians(right.longitude - left.longitude);
  const chord = Math.sin(latitude / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, chord))));
}

/** All limits compare directly to the anchor; no transitive chaining or identity rewriting. */
export function belongsToIncident(anchor: RelatedFacts, candidate: RelatedFacts, completionTimes: readonly Date[]): boolean {
  if (anchor.tenantId !== candidate.tenantId || anchor.regionId !== candidate.regionId || !sameIdentity(anchor, candidate)
    || Math.abs(anchor.createdAt.getTime() - candidate.createdAt.getTime()) > RELATED_WINDOW_MS
    || distanceMeters(anchor, candidate) > RELATED_CRITERIA.distanceMeters) return false;
  const earlier = Math.min(anchor.createdAt.getTime(), candidate.createdAt.getTime());
  const later = Math.max(anchor.createdAt.getTime(), candidate.createdAt.getTime());
  // A completion anywhere in this tenant/region for the same identity separates
  // a later incident from unresolved earlier reports, irrespective of distance.
  return !completionTimes.some(time => earlier < time.getTime() && time.getTime() <= later);
}

/** A deterministic history UUID binds retries to this exact batch, actor and snapshots without a new schema column. */
export function relatedHistoryId(anchorPublicId: string, adminId: string, input: AdminRelatedReportTransition, reportPublicId: string): string {
  const batch = {
    anchorPublicId, adminId, completionMethod: input.completionMethod,
    reports: input.reports.map(report => ({ publicId: report.publicId, expectedUpdatedAt: new Date(report.expectedUpdatedAt).toISOString() }))
      .sort((left, right) => left.publicId.localeCompare(right.publicId)),
    publicNote: input.publicNote || null, internalNote: input.internalNote || null,
  };
  const bytes = createHash('sha256').update('parkick-related-completion-v1\0').update(JSON.stringify(batch)).update('\0').update(reportPublicId).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
