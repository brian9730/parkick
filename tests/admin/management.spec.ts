import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '../../backend/src/generated/prisma/client';
import { hashPassword } from '../../backend/src/services/admin/password';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../../backend/scripts/local-database';

assertTaskLocalDatabase(localTestDatabaseUrl, true);
assert.equal(new URL(localTestDatabaseUrl).pathname, '/parkick_test');
const db = new PrismaClient({ datasourceUrl: localTestDatabaseUrl, log: [] });
const adminId = randomUUID();
const marker = `ADMIN_BROWSER:${randomUUID()}`;
const submissions: string[] = [];
const email = process.env.PARKICK_ADMIN_E2E_EMAIL!;
const password = process.env.PARKICK_ADMIN_E2E_PASSWORD!;
const origin = 'http://localhost:5177';
const phone = '01000000000';

test.beforeAll(async () => {
  await db.admin.create({ data: { id: adminId, email, passwordHash: await hashPassword(password), name: '관리자 브라우저 검증', role: 'PLATFORM_ADMIN', tenantId: null } });
});

test.afterAll(async () => {
  try {
    const root = resolve(process.env.PARKICK_ADMIN_E2E_STORAGE!);
    const rows = await db.report.findMany({ where: { submissionId: { in: submissions }, userDescription: marker }, select: { id: true, submissionId: true, images: true } });
    const files: { path: string; directory: string }[] = [];
    for (const row of rows) {
      for (const photo of row.images) {
        assert.match(photo.objectKey, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
        const path = resolve(root, photo.objectKey);
        const directory = resolve(root, photo.objectKey.split('/')[0]!);
        const child = relative(root, path);
        assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
        assert.equal((await lstat(root)).isSymbolicLink(), false);
        const directoryInfo = await lstat(directory);
        assert.equal(directoryInfo.isSymbolicLink(), false);
        assert.equal(directoryInfo.isDirectory(), true);
        const actualRoot = await realpath(root);
        const actualFile = await realpath(path);
        const actualChild = relative(actualRoot, actualFile);
        assert.ok(actualChild && !actualChild.startsWith('..') && !isAbsolute(actualChild));
        const fileInfo = await lstat(path);
        assert.equal(fileInfo.isSymbolicLink(), false);
        assert.equal(fileInfo.isFile(), true);
        files.push({ path, directory });
      }
    }
    // These UUIDs and marker belong only to this test run; never reset shared test tables.
    await db.report.deleteMany({ where: { id: { in: rows.map(row => row.id) }, submissionId: { in: submissions }, userDescription: marker } });
    for (const file of files) { await unlink(file.path); assert.deepEqual(await readdir(file.directory), []); await rmdir(file.directory); }
    await db.admin.deleteMany({ where: { id: adminId, email } });
    assert.equal(await db.adminSession.count({ where: { adminId } }), 0);
  } finally { await db.$disconnect(); }
});

async function submit(request: APIRequestContext, device: { operator?: string; deviceId?: string; latitude?: number; longitude?: number; address?: string } = {}) {
  const submissionId = randomUUID();
  submissions.push(submissionId);
  const response = await request.post('/api/reports', {
    headers: { Origin: origin },
    multipart: {
      report: JSON.stringify({ submissionId, operator: device.operator ?? null, deviceId: device.deviceId ?? null, qrRawData: null, latitude: device.latitude ?? 0, longitude: device.longitude ?? 0, address: device.address ?? null,
        categories: ['기타'], additionalDescription: marker, finalReportText: `${marker} 합성 신고`, phone, consent: true, reportConfirmed: true }),
      photos: { name: 'synthetic.png', mimeType: 'image/png', buffer: await readFile('tests/fixtures/unknown-qr.png') },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data as { publicId: string };
}

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

// Keep API reads real: these browser tests use the isolated PostgreSQL-backed server.
test('administrator finds a report, sees private evidence, collects it and publishes only its public note', async ({ page, request }, testInfo) => {
  const receipt = await submit(request);
  await login(page);
  await page.goto('/admin/reports');
  await page.getByLabel('신고 검색', { exact: true }).fill(receipt.publicId);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('link').filter({ hasText: receipt.publicId }).click();
  await expect(page.getByRole('heading', { name: '신고 상세', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '견인 완료', exact: true })).toHaveCount(0);
  const detail = await page.request.get(`/api/admin/reports/${receipt.publicId}`);
  expect(detail.status()).toBe(200);
  const initial = (await detail.json()).data;
  expect(initial.status).toBe('RECEIVED');
  expect(initial.images).toHaveLength(1);
  const photoUrl = initial.images[0].url;
  const photo = await page.request.get(photoUrl);
  expect(photo.status()).toBe(200);
  expect(photo.headers()['content-type']).toContain('image/jpeg');
  expect(photo.headers()['cache-control']).toContain('no-store');
  expect((await request.get(photoUrl)).status()).toBe(401);

  const publicNote = `${marker} 수거 완료 공개`;
  const internalNote = `${marker} 비공개 담당자 메모`;
  await page.getByLabel('공개 처리 메모', { exact: true }).fill(publicNote);
  await page.getByLabel('내부 메모', { exact: true }).fill(internalNote);
  await page.getByRole('button', { name: '수거 완료', exact: true }).click();
  await page.getByRole('button', { name: '변경 확인', exact: true }).click();
  await expect(page.getByText('수거 완료', { exact: true }).first()).toBeVisible();
  const complete = (await (await page.request.get(`/api/admin/reports/${receipt.publicId}`)).json()).data;
  expect(complete.status).toBe('COMPLETED');
  expect(complete.completionMethod).toBe('COLLECTED');
  expect(complete.history).toHaveLength(2);
  const publicResponse = await request.post(`/api/reports/lookup/${receipt.publicId}`, { headers: { Origin: origin }, data: { phone } });
  expect(publicResponse.status()).toBe(200);
  const publicResult = await publicResponse.json();
  expect(publicResult.data.completionMethod).toBe('COLLECTED');
  expect(JSON.stringify(publicResult)).toContain(publicNote);
  expect(JSON.stringify(publicResult)).not.toContain(internalNote);
  expect(JSON.stringify(publicResult)).not.toContain('internalNote');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('collected-detail-mobile.png'), fullPage: true });
});

test('administrator rejects a legacy processing report and citizen lookup shows only the public reason', async ({ page, request }) => {
  const receipt = await submit(request);
  await login(page);
  await expect(page.getByLabel('신고 핵심 현황')).toContainText('접수');
  await expect(page.getByLabel('신고 핵심 현황')).toContainText('반려');
  await expect(page.getByLabel('신고 핵심 현황')).not.toContainText('접수 대기');
  const initial = (await (await page.request.get(`/api/admin/reports/${receipt.publicId}`)).json()).data;
  const processing = await page.request.patch(`/api/admin/reports/${receipt.publicId}/status`, {
    headers: { Origin: origin }, data: { status: 'PROCESSING', expectedUpdatedAt: initial.updatedAt },
  });
  expect(processing.status()).toBe(200);
  await page.goto(`/admin/reports/${receipt.publicId}`);
  await expect(page.getByRole('button', { name: '반려', exact: true })).toBeVisible();
  const publicNote = `${marker} 신고 반려 사유`;
  const internalNote = `${marker} 비공개 반려 메모`;
  await page.getByLabel('공개 처리 메모', { exact: true }).fill(publicNote);
  await page.getByLabel('내부 메모', { exact: true }).fill(internalNote);
  await page.getByRole('button', { name: '반려', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '처리 상태 변경 확인' })).toContainText('저장 후에는 상태를 다시 변경할 수 없습니다.');
  await page.getByRole('button', { name: '변경 확인', exact: true }).click();
  await expect(page.getByText('신고를 반려했습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '반려', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '수거 완료', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '같은 기기 신고 함께 처리' })).toHaveCount(0);

  const detail = (await (await page.request.get(`/api/admin/reports/${receipt.publicId}`)).json()).data;
  expect(detail.status).toBe('REJECTED');
  expect(detail.completionMethod).toBeNull();
  expect(detail.completedAt).toBeNull();
  expect(detail.history).toHaveLength(3);
  expect(detail.history[2].publicNote).toBe(publicNote);
  expect(detail.history[2].internalNote).toBe(internalNote);
  const publicResponse = await request.post(`/api/reports/lookup/${receipt.publicId}`, { headers: { Origin: origin }, data: { phone } });
  expect(publicResponse.status()).toBe(200);
  const publicResult = await publicResponse.json();
  expect(publicResult.data.status).toBe('REJECTED');
  expect(JSON.stringify(publicResult)).toContain(publicNote);
  expect(JSON.stringify(publicResult)).not.toContain(internalNote);
  expect(JSON.stringify(publicResult)).not.toContain('internalNote');
  await page.goto('/report/status');
  await page.getByLabel('휴대전화 번호', { exact: true }).fill(phone);
  await page.getByRole('button', { name: '신고내역 조회', exact: true }).click();
  await page.locator(`.lookup-report-card[href="/report/status/${receipt.publicId}"]`).click();
  await expect(page.getByText(publicNote, { exact: true })).toBeVisible();
  await expect(page.getByText('반려', { exact: true }).first()).toBeVisible();
});

test('historical towing completion remains readable and completed status remains immutable', async ({ page, request }) => {
  const receipt = await submit(request);
  await login(page);
  await page.goto(`/admin/reports/${receipt.publicId}`);
  const initial = (await (await page.request.get(`/api/admin/reports/${receipt.publicId}`)).json()).data;
  await expect(page.getByRole('button', { name: '견인 완료', exact: true })).toHaveCount(0);
  const legacy = await page.request.patch(`/api/admin/reports/${receipt.publicId}/status`, { headers: { Origin: origin }, data: { status: 'COMPLETED', completionMethod: 'TOWED', publicNote: `${marker} 견인 공개`, internalNote: '', expectedUpdatedAt: initial.updatedAt } });
  expect(legacy.status()).toBe(200);
  await page.reload();
  await expect(page.getByText('견인 완료', { exact: true }).first()).toBeVisible();
  const detail = (await (await page.request.get(`/api/admin/reports/${receipt.publicId}`)).json()).data;
  expect(detail.history).toHaveLength(2);
  expect(detail.completionMethod).toBe('TOWED');
  const duplicate = await page.request.patch(`/api/admin/reports/${receipt.publicId}/status`, { headers: { Origin: origin }, data: { status: 'COMPLETED', completionMethod: 'TOWED', publicNote: `${marker} 견인 공개`, internalNote: '', expectedUpdatedAt: initial.updatedAt } });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).data.history).toHaveLength(2);
  const conflict = await page.request.patch(`/api/admin/reports/${receipt.publicId}/status`, { headers: { Origin: origin }, data: { status: 'COMPLETED', completionMethod: 'COLLECTED', expectedUpdatedAt: detail.updatedAt } });
  expect(conflict.status()).toBe(409);
  const publicResponse = await request.post(`/api/reports/lookup/${receipt.publicId}`, { headers: { Origin: origin }, data: { phone } });
  expect((await publicResponse.json()).data.completionMethod).toBe('TOWED');
});

test('administrator explicitly selects related reports and completes only those reports with separate histories', async ({ page, request }, testInfo) => {
  const deviceId = `REL-${randomUUID().slice(0, 8)}`;
  const anchor = await submit(request, { operator: 'GCOO', deviceId, latitude: 37.5665, longitude: 126.978, address: '함께 처리 검증 위치' });
  const selected = await submit(request, { operator: '지쿠터', deviceId: deviceId.toLowerCase(), latitude: 37.56655, longitude: 126.978, address: '함께 처리 검증 위치 근처' });
  const untouched = await submit(request, { operator: '지쿠', deviceId, latitude: 37.5666, longitude: 126.978, address: '선택하지 않을 검증 위치' });
  await login(page);
  await page.goto(`/admin/reports/${anchor.publicId}`);
  const panel = page.getByRole('region', { name: '같은 기기 신고 함께 처리', exact: true });
  await expect(panel.getByRole('checkbox')).toHaveCount(2);
  await expect(panel.getByRole('checkbox').nth(0)).not.toBeChecked();
  await expect(panel.getByRole('checkbox').nth(1)).not.toBeChecked();
  await expect(panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: '선택 신고 함께 견인 완료', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: `${selected.publicId} 신고 상세 새 창에서 보기`, exact: true })).toHaveAttribute('target', '_blank');
  await panel.getByRole('checkbox', { name: `${selected.publicId} 함께 처리 선택`, exact: true }).check();
  await expect(panel.getByText('추가 신고 1건 선택 · 현재 신고 포함 2건', { exact: true })).toBeVisible();
  const publicNote = `${marker} 함께 수거 공개`;
  const internalNote = `${marker} 함께 수거 내부`;
  await panel.getByLabel('함께 처리할 공개 메모', { exact: true }).fill(publicNote);
  await panel.getByLabel('함께 처리할 내부 메모', { exact: true }).fill(internalNote);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('related-selection-mobile.png'), fullPage: true });

  let bulkRequests = 0;
  page.on('request', outgoing => { if (outgoing.method() === 'PATCH' && outgoing.url().endsWith('/related/status')) bulkRequests += 1; });
  await panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '신고 2건 함께 처리 확인', exact: true });
  await expect(dialog.getByText(anchor.publicId, { exact: true })).toBeVisible();
  await expect(dialog.getByText(selected.publicId, { exact: true })).toBeVisible();
  await expect(dialog.getByText(untouched.publicId, { exact: true })).toHaveCount(0);
  expect(bulkRequests).toBe(0);
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect(bulkRequests).toBe(0);
  await expect(panel.getByRole('checkbox', { name: `${selected.publicId} 함께 처리 선택`, exact: true })).toBeChecked();
  await panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true }).click();
  await dialog.getByRole('button', { name: '2건 완료 확인', exact: true }).click();
  await expect(page.getByText('신고 2건을 수거 완료로 저장했습니다. 각 신고의 접수번호와 내역은 유지됩니다.', { exact: true })).toBeVisible();
  expect(bulkRequests).toBe(1);
  await expect(page.getByRole('heading', { name: '같은 기기 신고 함께 처리', exact: true })).toHaveCount(0);

  for (const item of [anchor, selected]) {
    const response = await page.request.get(`/api/admin/reports/${item.publicId}`);
    expect(response.status()).toBe(200);
    const detail = (await response.json()).data;
    expect(detail.publicId).toBe(item.publicId);
    expect(detail.status).toBe('COMPLETED');
    expect(detail.completionMethod).toBe('COLLECTED');
    expect(detail.history).toHaveLength(2);
    expect(detail.history[1].publicNote).toBe(publicNote);
    expect(detail.history[1].internalNote).toBe(internalNote);
    const publicResponse = await request.post(`/api/reports/lookup/${item.publicId}`, { headers: { Origin: origin }, data: { phone } });
    expect(publicResponse.status()).toBe(200);
    const result = await publicResponse.json();
    expect(JSON.stringify(result)).toContain(publicNote);
    expect(JSON.stringify(result)).not.toContain(internalNote);
  }
  const remaining = (await (await page.request.get(`/api/admin/reports/${untouched.publicId}`)).json()).data;
  expect(remaining.status).toBe('RECEIVED');
  expect(remaining.history).toHaveLength(1);
});

test('stale related report aborts the whole completion and requires fresh explicit selection', async ({ page, request }) => {
  const deviceId = `STALE-${randomUUID().slice(0, 8)}`;
  const anchor = await submit(request, { operator: '빔', deviceId, latitude: 37.5665, longitude: 126.978 });
  const candidate = await submit(request, { operator: 'Beam', deviceId, latitude: 37.56655, longitude: 126.978 });
  await login(page);
  await page.goto(`/admin/reports/${anchor.publicId}`);
  const panel = page.getByRole('region', { name: '같은 기기 신고 함께 처리', exact: true });
  const checkbox = panel.getByRole('checkbox', { name: `${candidate.publicId} 함께 처리 선택`, exact: true });
  await checkbox.check();
  const before = (await (await page.request.get(`/api/admin/reports/${candidate.publicId}`)).json()).data;
  const concurrentUpdate = await page.request.patch(`/api/admin/reports/${candidate.publicId}/status`, {
    headers: { Origin: origin }, data: { status: 'PROCESSING', expectedUpdatedAt: before.updatedAt, internalNote: `${marker} 다른 관리자 선행 조치` },
  });
  expect(concurrentUpdate.status()).toBe(200);

  await panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '2건 완료 확인', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('신고 상태 또는 함께 처리할 수 있는 조건이 변경되어 저장하지 않았습니다.');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true })).toBeDisabled();
  const unchangedAnchor = (await (await page.request.get(`/api/admin/reports/${anchor.publicId}`)).json()).data;
  const unchangedCandidate = (await (await page.request.get(`/api/admin/reports/${candidate.publicId}`)).json()).data;
  expect(unchangedAnchor.status).toBe('RECEIVED');
  expect(unchangedAnchor.history).toHaveLength(1);
  expect(unchangedCandidate.status).toBe('PROCESSING');
  expect(unchangedCandidate.history).toHaveLength(2);

  await panel.getByRole('button', { name: '최신 상태 불러오기', exact: true }).click();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await panel.getByRole('button', { name: '선택 신고 함께 수거 완료', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '2건 완료 확인', exact: true }).click();
  await expect(page.getByText('신고 2건을 수거 완료로 저장했습니다. 각 신고의 접수번호와 내역은 유지됩니다.', { exact: true })).toBeVisible();
  for (const item of [anchor, candidate]) {
    const detail = (await (await page.request.get(`/api/admin/reports/${item.publicId}`)).json()).data;
    expect(detail.status).toBe('COMPLETED');
    expect(detail.completionMethod).toBe('COLLECTED');
    expect(detail.history).toHaveLength(item === anchor ? 2 : 3);
  }
});
