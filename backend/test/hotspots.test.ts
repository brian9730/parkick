import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import request from 'supertest';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { PrismaAdminReportRepository } from '../src/repositories/AdminReportRepository.js';
import { adminReportHotspotQuery } from '../src/services/admin/adminReportInput.js';
import { HOTSPOT_DISTANCE_METERS, reportHotspots } from '../src/services/admin/reportHotspots.js';
import { distanceMeters } from '../src/services/admin/relatedReportRules.js';

const latitudeOffset = (meters: number) => meters / 111_194.92664455873;

describe('Admin report hotspots', () => {
  it('groups every report within a fixed geographic distance and expands a chain circle to cover its members', () => {
    const chain = [0, 80, 160, 240, 320].map(meters => ({ latitude: latitudeOffset(meters), longitude: 0 }));
    const yellow = [0, 60, 120].map(meters => ({ latitude: 1 + latitudeOffset(meters), longitude: 1 }));
    const points = [...chain, ...yellow, { latitude: 3, longitude: 3 },
      { latitude: Number.NaN, longitude: 0 }, { latitude: 91, longitude: 0 }];
    const result = reportHotspots(points);
    assert.equal(result.totalReports, 9);
    assert.deepEqual(result.zones.map(zone => ({ count: zone.count, level: zone.level })),
      [{ count: 5, level: 'red' }, { count: 3, level: 'yellow' }]);
    assert.ok(result.zones[0]!.radiusMeters > HOTSPOT_DISTANCE_METERS);
    for (const [zone, members] of [[result.zones[0]!, chain], [result.zones[1]!, yellow]] as const) {
      assert.ok(members.every(point => distanceMeters(zone, point) <= zone.radiusMeters));
    }
    assert.deepEqual(reportHotspots([...points].reverse()), result);
  });

  it('uses the 150 m boundary and joins coordinates across the antimeridian', () => {
    const near = reportHotspots([0, 75, 149.5].map(meters => ({ latitude: latitudeOffset(meters), longitude: 0 })));
    assert.equal(near.zones[0]?.count, 3);
    const beyond = reportHotspots([0, 75, 225.5].map(meters => ({ latitude: latitudeOffset(meters), longitude: 0 })));
    assert.deepEqual(beyond.zones, []);
    const dateline = reportHotspots([{ latitude: 0, longitude: 179.9995 }, { latitude: 0, longitude: -179.9995 }, { latitude: 0, longitude: 180 }]);
    assert.equal(dateline.zones[0]?.count, 3);
    assert.ok(Math.abs(dateline.zones[0]!.longitude) > 179.9);
  });

  it('queries all scoped matching coordinates without map pagination or private report fields', async () => {
    const tenantId = randomUUID();
    let captured: Prisma.ReportFindManyArgs | undefined;
    const client = { report: { findMany: async (args: Prisma.ReportFindManyArgs) => {
      captured = args;
      return Array.from({ length: 501 }, () => ({ latitude: { toNumber: () => 37.5 }, longitude: { toNumber: () => 127 } }));
    } } } as unknown as PrismaClient;
    const repository = new PrismaAdminReportRepository('unused', client);
    const scope = { adminId: randomUUID(), role: 'TENANT_ADMIN' as const, tenantId };
    const result = await repository.hotspots(scope, adminReportHotspotQuery.parse({ status: 'PROCESSING', q: 'beam' }));
    assert.equal(result.mode, 'database');
    assert.equal(result.totalReports, 501);
    assert.equal(result.zones[0]?.count, 501);
    assert.equal(result.zones[0]?.level, 'red');
    assert.equal(captured?.where?.tenantId, tenantId);
    assert.equal(captured?.where?.status, 'PROCESSING');
    assert.ok(captured?.where?.OR);
    assert.deepEqual(captured?.select, { latitude: true, longitude: true });
    assert.equal(captured?.take, undefined);
    assert.equal(captured?.skip, undefined);
    await assert.rejects(repository.hotspots({ ...scope, tenantId: null }, adminReportHotspotQuery.parse({})),
      (error: unknown) => error instanceof ApiError && error.status === 403);
  });

  it('requires admin authentication and rejects caller-supplied scope or pagination', async t => {
    const app = await createApp(readConfig({ NODE_ENV: 'test', AI_PROVIDER: 'disabled', ENABLE_DEV_ADMIN: 'true',
      DEV_ADMIN_EMAIL: 'dev@example.test', DEV_ADMIN_PASSWORD: 'safe-test-password-123' }));
    t.after(() => app.closeResources());
    await request(app).get('/api/admin/reports/hotspots').expect(401);
    const login = await request(app).post('/api/admin/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'dev@example.test', password: 'safe-test-password-123' }).expect(200);
    const cookie = String(login.headers['set-cookie'][0]).split(';')[0]!;
    const response = await request(app).get('/api/admin/reports/hotspots').set('Cookie', cookie).expect(200);
    assert.deepEqual(response.body.data, { mode: 'skeleton', zones: [], totalReports: 0 });
    for (const query of ['?tenantId=private', '?page=1', '?pageSize=500', '?status=INVALID']) {
      await request(app).get(`/api/admin/reports/hotspots${query}`).set('Cookie', cookie).expect(400);
    }
  });
});
