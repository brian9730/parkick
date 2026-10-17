import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaAdminReportRepository } from '../src/repositories/AdminReportRepository.js';
import { adminRelatedReportTransition } from '../src/services/admin/adminReportInput.js';
import { belongsToIncident, deviceIdentity, knownIdentity, relatedHistoryId, RELATED_WINDOW_MS, type RelatedFacts } from '../src/services/admin/relatedReportRules.js';

const publicId = (value: number) => `PK-20261016-${value.toString(16).padStart(12, '0')}`;
const anchor: RelatedFacts = { publicId: publicId(1), tenantId: randomUUID(), regionId: randomUUID(), operatorName: 'beam', deviceId: ' 00ab-123 ',
  latitude: 37.5, longitude: 127, createdAt: new Date('2026-10-16T00:00:00.000Z') };
const atDistance = (meters: number) => ({ ...anchor, publicId: publicId(2), latitude: anchor.latitude + meters / 6371000 * 180 / Math.PI });
const input = { status: 'COMPLETED', completionMethod: 'COLLECTED', reports: [
  { publicId: publicId(1), expectedUpdatedAt: anchor.createdAt.toISOString() },
  { publicId: publicId(2), expectedUpdatedAt: anchor.createdAt.toISOString() },
] } as const;

describe('Related report eligibility and explicit batch input', () => {
  it('matches known operator aliases and whitespace/case only device normalization without changing stored facts', () => {
    assert.deepEqual(knownIdentity(anchor), { operatorId: 'beam', deviceId: '00AB-123' });
    assert.equal(deviceIdentity(' \t00 ab-1\n23\u00a0'), '00AB-123');
    assert.equal(deviceIdentity(null), null);
    assert.equal(deviceIdentity(' \t'), null);
    assert.ok(belongsToIncident(anchor, { ...atDistance(20), operatorName: '빔', deviceId: '00AB-123' }, []));
    for (const patch of [{ operatorName: '스윙' }, { operatorName: '이름을 모르는 업체' }, { operatorName: null },
      { deviceId: 'AB-123' }, { deviceId: '00AB123' }, { deviceId: null }, { tenantId: randomUUID() }, { regionId: randomUUID() }]) {
      assert.equal(belongsToIncident(anchor, { ...atDistance(20), ...patch }, []), false);
    }
    assert.equal(anchor.operatorName, 'beam'); assert.equal(anchor.deviceId, ' 00ab-123 ');
  });

  it('uses symmetric anchor distance/time limits without transitive groups', () => {
    assert.equal(belongsToIncident(anchor, atDistance(99), []), true);
    assert.equal(belongsToIncident(anchor, atDistance(101), []), false);
    const middle = atDistance(70); const far = atDistance(140);
    assert.equal(belongsToIncident(middle, far, []), true);
    assert.equal(belongsToIncident(anchor, far, []), false);
    for (const direction of [-1, 1]) {
      assert.equal(belongsToIncident(anchor, { ...atDistance(10), createdAt: new Date(anchor.createdAt.getTime() + direction * RELATED_WINDOW_MS) }, []), true);
      assert.equal(belongsToIncident(anchor, { ...atDistance(10), createdAt: new Date(anchor.createdAt.getTime() + direction * (RELATED_WINDOW_MS + 1)) }, []), false);
    }
  });

  it('separates reports straddling completion and preserves reports created on the same side', () => {
    const later = { ...atDistance(10), createdAt: new Date(anchor.createdAt.getTime() + 60_000) };
    const completion = new Date(anchor.createdAt.getTime() + 30_000);
    assert.equal(belongsToIncident(anchor, later, [completion]), false);
    assert.equal(belongsToIncident(later, anchor, [completion]), false);
    assert.equal(belongsToIncident(anchor, later, [new Date(anchor.createdAt.getTime() - 1)]), true);
    assert.equal(belongsToIncident(anchor, later, [new Date(later.createdAt.getTime() + 1)]), true);
  });

  it('accepts only bounded distinct explicit selections and completion commands', () => {
    assert.equal(adminRelatedReportTransition.safeParse(input).success, true);
    for (const patch of [{ reports: [] }, { reports: [input.reports[0]] }, { reports: [input.reports[0], input.reports[0]] },
      { reports: Array.from({ length: 101 }, (_, index) => ({ ...input.reports[0], publicId: publicId(index) })) },
      { status: 'PROCESSING' }, { completionMethod: undefined }, { completionMethod: 'DELETED' }, { tenantId: randomUUID() },
      { publicNote: 'x'.repeat(1001) }, { internalNote: '\0' },
      { reports: [input.reports[0], { ...input.reports[1], expectedUpdatedAt: 'not-a-date' }] },
    ]) assert.equal(adminRelatedReportTransition.safeParse({ ...input, ...patch }).success, false);
  });

  it('binds idempotent history IDs to the exact batch, actor, versions and notes', () => {
    const parsed = adminRelatedReportTransition.parse(input);
    const adminId = randomUUID();
    const id = relatedHistoryId(anchor.publicId, adminId, parsed, publicId(1));
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.equal(relatedHistoryId(anchor.publicId, adminId, { ...parsed, reports: [...parsed.reports].reverse() }, publicId(1)), id);
    for (const changed of [{ ...parsed, completionMethod: 'TOWED' as const }, { ...parsed, publicNote: '다른 안내' },
      { ...parsed, reports: [parsed.reports[0]!] }, { ...parsed, reports: parsed.reports.map(report => ({ ...report, expectedUpdatedAt: '2026-10-16T01:00:00.000Z' })) }]) {
      assert.notEqual(relatedHistoryId(anchor.publicId, adminId, changed, publicId(1)), id);
    }
    assert.notEqual(relatedHistoryId(anchor.publicId, randomUUID(), parsed, publicId(1)), id);
    assert.notEqual(relatedHistoryId(publicId(2), adminId, parsed, publicId(1)), id);
    assert.notEqual(relatedHistoryId(anchor.publicId, adminId, parsed, publicId(2)), id);
  });

  it('fails closed with explicit truncation when completion-boundary scanning exceeds its limit', async () => {
    const transaction = { report: {
      findFirst: async () => ({ ...anchor, id: randomUUID(), status: 'RECEIVED' }),
      findMany: async () => Array.from({ length: 1001 }, () => ({ operatorName: '빔', deviceId: '00AB-123', completedAt: new Date() })),
    } };
    const client = { $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction) } as unknown as PrismaClient;
    const repository = new PrismaAdminReportRepository('unused', client);
    assert.deepEqual(await repository.related({ adminId: randomUUID(), role: 'PLATFORM_ADMIN', tenantId: null }, anchor.publicId), {
      anchorPublicId: anchor.publicId, eligible: false, reason: 'CANDIDATE_LIMIT', criteria: { distanceMeters: 100, timeWindowHours: 24, maxSelection: 100 }, items: [], truncated: true,
    });
  });

  it('replays the exact committed batch even when its own completions pushed the boundary scan over the limit', async () => {
    const scope = { adminId: randomUUID(), role: 'TENANT_ADMIN' as const, tenantId: anchor.tenantId };
    const parsed = adminRelatedReportTransition.parse(input);
    const completedAt = new Date(anchor.createdAt.getTime() + 60_000);
    const rows = parsed.reports.map(report => ({
      ...anchor, id: randomUUID(), publicId: report.publicId, createdAt: anchor.createdAt, updatedAt: completedAt,
      status: 'COMPLETED', completionMethod: 'COLLECTED', completedAt, completedByAdminId: scope.adminId,
      latitude: { toNumber: () => anchor.latitude }, longitude: { toNumber: () => anchor.longitude },
      categories: [], address: null, tenant: { id: anchor.tenantId, name: 'Test tenant' }, region: { id: anchor.regionId, name: 'Test region' },
      statusHistory: [{ id: relatedHistoryId(anchor.publicId, scope.adminId, parsed, report.publicId), adminId: scope.adminId,
        newStatus: 'COMPLETED', completionMethod: 'COLLECTED', publicNote: null, internalNote: null }],
    }));
    let boundaryQueries = 0;
    const transaction = { report: { findMany: async (query: Prisma.ReportFindManyArgs) => {
      if (query.where?.status === 'COMPLETED') {
        boundaryQueries += 1;
        return Array.from({ length: 1001 }, () => ({ operatorName: '빔', deviceId: '00AB-123', completedAt }));
      }
      assert.equal(query.where?.tenantId, anchor.tenantId);
      return rows;
    } } };
    const client = { $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction) } as unknown as PrismaClient;
    const repository = new PrismaAdminReportRepository('unused', client);
    const result = await repository.transitionRelated(scope, anchor.publicId, parsed);
    assert.equal(result.replayed, true); assert.equal(result.items.length, 2); assert.equal(boundaryQueries, 0);
    await assert.rejects(repository.transitionRelated(scope, anchor.publicId, { ...parsed, publicNote: 'Different command' }),
      (error: unknown) => error instanceof Error && 'status' in error && error.status === 409);
    assert.equal(boundaryQueries, 0);
  });
});
