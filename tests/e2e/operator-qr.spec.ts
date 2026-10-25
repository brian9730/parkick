import { resolve } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';

// These generated QR images use synthetic device IDs, not copied vehicle photos.
async function scan(page: Page, file: string) {
  const response = page.waitForResponse('/api/qr/parse');
  await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures', file));
  const parsed = await response;
  expect(parsed.status()).toBe(200);
  return (await parsed.json()).data;
}

test.beforeEach(async ({ page }) => {
  // Decode locally and call only the actual local API; vendor URLs must never open.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto('/report');
});

for (const fixture of [
  { file: 'kakao-bike-qr.png', operatorId: 'kakao-bike', operatorName: '카카오 T 바이크', deviceId: 'AB1234' },
  { file: 'beam-qr.png', operatorId: 'beam', operatorName: '빔', deviceId: '7654321' },
  { file: 'beam-alpha-qr.png', operatorId: 'beam', operatorName: '빔', deviceId: 'ZX456' },
  { file: 'gcoo-number-qr.png', operatorId: 'gcoo', operatorName: '지쿠', deviceId: '123456' },
]) test(`${fixture.operatorId} ${fixture.deviceId} QR image fills the display name and device without extra confirmation`, async ({ page }) => {
  const vendorRequests: string[] = [];
  page.on('request', request => { if (/t\.kakao\.com|ridebeam\.com|gbike\.io/.test(new URL(request.url()).hostname)) vendorRequests.push(request.url()); });
  const parsed = await scan(page, fixture.file);
  expect(parsed).toMatchObject({ matched: true, operatorId: fixture.operatorId, operatorName: fixture.operatorName, deviceId: fixture.deviceId, source: 'registered-parser' });
  await expect(page.getByLabel('업체 확인 방법')).toHaveCount(0);
  await expect(page.getByLabel('운영업체', { exact: true })).toHaveValue(fixture.operatorId);
  await expect(page.getByText('QR에서 확인한 업체예요. 변경할 수 있어요.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('기기번호', { exact: true })).toHaveValue(fixture.deviceId);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // Corrections remain possible without a separate acknowledgement.
  await page.getByLabel('기기번호', { exact: true }).fill('CORRECTED-42');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  expect(vendorRequests).toEqual([]);
});

test('GCOO identifies only the operator and keeps device entry explicit', async ({ page }) => {
  expect(await scan(page, 'gcoo-qr.png')).toMatchObject({ matched: true, operatorId: 'gcoo', operatorName: '지쿠', deviceId: null });
  await expect(page.getByLabel('운영업체', { exact: true })).toHaveValue('gcoo');
  await expect(page.getByLabel('기기번호', { exact: true })).toHaveValue('');
  await expect(page.locator('.inline-notice')).toContainText('직접 입력해 주세요');
  await expect(page.getByLabel('기기번호', { exact: true })).toBeEnabled();
  await page.getByLabel('기기번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
});

test('a numeric-only rescan clears previous identification and permits custom operator entry', async ({ page }) => {
  await scan(page, 'kakao-bike-qr.png');
  expect(await scan(page, 'numeric-only-qr.png')).toMatchObject({ matched: false, operatorId: null, operatorName: null, deviceId: null });
  await expect(page.getByLabel('운영업체', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('기기번호', { exact: true })).toHaveValue('');
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('직접 확인한 다른 업체');
  await expect(page.getByLabel('기타 업체명', { exact: true })).toHaveValue('직접 확인한 다른 업체');
  await page.getByText('읽은 QR 원문 확인', { exact: true }).click();
  await expect(page.locator('.qr-result pre')).toHaveText('86420');
});

test('a numeric QR needs the Beam selection and loses that number when another company is selected', async ({ page }) => {
  expect(await scan(page, 'numeric-only-qr.png')).toMatchObject({ matched: false, operatorId: null, deviceId: null, source: 'unknown' });
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  const device = page.getByLabel('기기번호', { exact: true });
  await expect(operator).toHaveValue('');
  await expect(device).toHaveValue('');
  await expect(page.locator('.device-step .inline-notice')).toContainText('숫자만 있어 업체를 알 수 없어요');
  await expect(page.getByText('QR에서 확인한 업체예요. 변경할 수 있어요.', { exact: true })).toHaveCount(0);

  const selectedResponse = page.waitForResponse('/api/qr/parse');
  await operator.selectOption('beam');
  const selected = await selectedResponse;
  expect(selected.request().postDataJSON()).toEqual({ rawQr: '86420', selectedOperatorId: 'beam' });
  expect((await selected.json()).data).toMatchObject({
    matched: true, operatorId: 'beam', operatorName: '빔', deviceId: '86420', source: 'operator-selection',
  });
  await expect(device).toHaveValue('86420');
  await expect(device).toBeEnabled();
  await expect(page.locator('.device-step .inline-notice')).toContainText('선택한 업체를 기준으로');
  await expect(page.getByText('QR에서 확인한 업체예요. 변경할 수 있어요.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(operator).toHaveValue('beam');
  await expect(device).toHaveValue('86420');

  const otherResponse = page.waitForResponse('/api/qr/parse');
  await operator.selectOption('swing');
  expect((await (await otherResponse).json()).data).toMatchObject({ matched: false, operatorId: null, deviceId: null });
  await expect(operator).toHaveValue('swing');
  await expect(device).toHaveValue('');
  await expect(device).toBeEnabled();
});

test('selecting Beam before a numeric photo supplies company context without claiming QR company detection', async ({ page }) => {
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  const device = page.getByLabel('기기번호', { exact: true });
  await operator.selectOption('beam');
  await device.fill('BEFORE-SCAN');
  const request = page.waitForRequest('**/api/qr/parse');
  expect(await scan(page, 'numeric-only-qr.png')).toMatchObject({
    matched: true, operatorId: 'beam', deviceId: '86420', source: 'operator-selection',
  });
  expect((await request).postDataJSON()).toEqual({ rawQr: '86420', selectedOperatorId: 'beam' });
  await expect(operator).toHaveValue('beam');
  await expect(device).toHaveValue('86420');
  await expect(page.locator('.device-step .inline-notice')).toContainText('선택한 업체를 기준으로');
  await expect(page.getByText('QR에서 확인한 업체예요. 변경할 수 있어요.', { exact: true })).toHaveCount(0);
  await device.fill('86421');
});

test('manual changes cancel a pending numeric QR company lookup and keep a late response from overwriting them', async ({ page }) => {
  await scan(page, 'numeric-only-qr.png');
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  const device = page.getByLabel('기기번호', { exact: true });
  let receive!: (route: Route) => void;
  const pending = new Promise<Route>(resolve => { receive = resolve; });
  await page.route('**/api/qr/parse', route => { receive(route); });
  await operator.selectOption('beam');
  const held = await pending;
  expect(held.request().postDataJSON()).toEqual({ rawQr: '86420', selectedOperatorId: 'beam' });
  await expect(page.getByText('선택한 업체의 QR 기기번호를 확인하고 있어요.', { exact: true })).toBeVisible();
  await device.fill('MANUAL-86421');
  await expect(page.getByText('선택한 업체의 QR 기기번호를 확인하고 있어요.', { exact: true })).toHaveCount(0);
  await operator.selectOption('swing');

  const result = await held.fetch();
  expect(result.status()).toBe(200);
  expect((await result.json()).data).toMatchObject({ operatorId: 'beam', deviceId: '86420', source: 'operator-selection' });
  const delivered = page.waitForResponse('/api/qr/parse');
  await held.fulfill({ response: result });
  await (await delivered).finished();
  await expect(operator).toHaveValue('swing');
  await expect(device).toHaveValue('MANUAL-86421');
  await expect(page.locator('.device-step .inline-notice')).toHaveCount(0);
});

for (const change of ['device', 'operator'] as const) test(`a manual ${change} edit cancels pending local image decoding before it can parse or overwrite fields`, async ({ page }) => {
  // Pause the real image decoder without substituting QR contents or the API.
  await page.evaluate(() => {
    const state = { entered: false, source: '', revoked: [] as string[], release: () => {} };
    (window as typeof window & { __heldQrImage: typeof state }).__heldQrImage = state;
    const originalDecode = HTMLImageElement.prototype.decode;
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    HTMLImageElement.prototype.decode = async function () {
      await originalDecode.call(this);
      if (state.entered) return;
      state.entered = true;
      state.source = this.src;
      await new Promise<void>(resolve => { state.release = resolve; });
    };
    URL.revokeObjectURL = source => { state.revoked.push(source); originalRevoke(source); };
  });
  const parses: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/qr/parse')) parses.push(request.postData() || '');
  });
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  const device = page.getByLabel('기기번호', { exact: true });
  await operator.selectOption('beam');
  await device.fill('MANUAL-41');
  await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures/kakao-bike-qr.png'));
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __heldQrImage: { entered: boolean } }).__heldQrImage.entered)).toBe(true);
  await expect(page.getByText('QR 사진을 확인하고 있어요…', { exact: true })).toBeVisible();

  if (change === 'device') await device.fill('MANUAL-42');
  else await operator.selectOption('swing');
  await expect(page.getByText('QR 사진을 확인하고 있어요…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'QR 사진 선택', exact: true })).toBeEnabled();
  await page.evaluate(() => (window as typeof window & { __heldQrImage: { release: () => void } }).__heldQrImage.release());
  // Revocation occurs in the real helper's finally block, after the held decode resumes.
  await expect.poll(() => page.evaluate(() => {
    const state = (window as typeof window & { __heldQrImage: { source: string; revoked: string[] } }).__heldQrImage;
    return state.revoked.includes(state.source);
  })).toBe(true);
  expect(parses).toEqual([]);
  await expect(operator).toHaveValue(change === 'operator' ? 'swing' : 'beam');
  await expect(device).toHaveValue(change === 'device' ? 'MANUAL-42' : 'MANUAL-41');
  await expect(page.locator('.qr-result')).toHaveCount(0);
  await expect(page.locator('.device-step .inline-notice')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // A cancelled session cannot poison a later explicit rescan of the same image.
  expect(await scan(page, 'kakao-bike-qr.png')).toMatchObject({ operatorId: 'kakao-bike', deviceId: 'AB1234' });
  await expect(operator).toHaveValue('kakao-bike');
  await expect(device).toHaveValue('AB1234');
  expect(parses).toHaveLength(1);
});

test('manual edits cancel a pending QR lookup and a late response cannot overwrite them', async ({ page }) => {
  let receive!: (route: Route) => void;
  const pending = new Promise<Route>(resolve => { receive = resolve; });
  await page.route('**/api/qr/parse', route => { receive(route); });
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  const device = page.getByLabel('기기번호', { exact: true });
  await operator.selectOption('beam');
  await device.fill('BEFORE-SCAN');

  await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures/kakao-bike-qr.png'));
  const held = await pending;
  await expect(page.getByText('QR 정보의 업체 규격을 확인하고 있어요.', { exact: true })).toBeVisible();

  // Editing the device alone also cancels lookup; the notice must clear immediately.
  await device.fill('MANUAL-42');
  await expect(page.getByText('QR 정보의 업체 규격을 확인하고 있어요.', { exact: true })).toHaveCount(0);
  await operator.selectOption('swing');
  await device.fill('MANUAL-43');

  // Release a real local parser response only after the user's manual correction.
  const result = await held.fetch();
  expect(result.status()).toBe(200);
  expect((await result.json()).data).toMatchObject({ operatorId: 'kakao-bike', deviceId: 'AB1234' });
  const delivered = page.waitForResponse('/api/qr/parse');
  await held.fulfill({ response: result });
  await (await delivered).finished();
  await expect(operator).toHaveValue('swing');
  await expect(device).toHaveValue('MANUAL-43');
  await expect(page.locator('.device-step .inline-notice')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(operator).toHaveValue('swing');
  await expect(device).toHaveValue('MANUAL-43');
});

test('one operator selector offers six standard names and preserves the selection through back navigation', async ({ page }) => {
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  await expect(page.getByLabel('업체 확인 방법')).toHaveCount(0);
  await expect(operator).toHaveValue('');
  await expect(operator.locator('option')).toHaveText([
    '선택하기', '지쿠', '빔', '카카오 T 바이크', '쏘카 일레클', '알파카', '스윙', '기타 업체',
  ]);
  await page.getByLabel('기기번호', { exact: true }).fill('SELECTOR-42');
  for (const id of ['gcoo', 'beam', 'kakao-bike', 'elecle', 'alpaca', 'swing']) {
    await operator.selectOption(id);
    await expect(page.getByLabel('기타 업체명', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '다음 단계', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
    await page.getByRole('button', { name: '이전', exact: true }).click();
    await expect(operator).toHaveValue(id);
  }
});

test('known aliases entered as another operator become the standard selection on blur', async ({ page }) => {
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  await page.getByLabel('기기번호', { exact: true }).fill('ALIAS-42');
  for (const [alias, id] of [['카카오바이크', 'kakao-bike'], ['  bEaM  ', 'beam'], ['일레클', 'elecle']]) {
    await operator.selectOption('other');
    const custom = page.getByLabel('기타 업체명', { exact: true });
    await custom.fill(alias);
    await custom.blur();
    await expect(operator).toHaveValue(id);
    await expect(custom).toHaveCount(0);
  }
  await operator.selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('새로운 지역 업체');
  await page.getByLabel('기타 업체명', { exact: true }).blur();
  await expect(operator).toHaveValue('other');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(operator).toHaveValue('other');
  await expect(page.getByLabel('기타 업체명', { exact: true })).toHaveValue('새로운 지역 업체');
  await page.getByLabel('기타 업체명', { exact: true }).fill('수정한 지역 업체');
});

/** Capture browser contracts without creating reports or invoking an external AI provider. */
async function captureOperatorRequests(page: Page) {
  const aiRequests: string[] = [];
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/api/reports/status', route => route.fulfill({ json: { data: { available: true, mode: 'local' } } }));
  page.on('request', request => { if (request.url().includes('/api/ai/generate-report')) aiRequests.push(request.url()); });
  await page.route('**/api/reports', async route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    const multipart = await new Response(new Uint8Array(request.postDataBuffer()!), {
      headers: { 'content-type': request.headers()['content-type'] },
    }).formData();
    const submitted = JSON.parse(String(multipart.get('report'))) as Record<string, unknown>;
    submissions.push(submitted);
    expect(multipart.getAll('photos')).toHaveLength(1);
    await route.fulfill({ status: 201, json: { data: {
      publicId: `PK-OPERATOR-CONTRACT-${submissions.length}`, status: 'RECEIVED', createdAt: new Date().toISOString(),
      address: submitted.address, latitude: submitted.latitude, longitude: submitted.longitude, hasContact: false,
    } } });
  });
  return { aiRequests, submissions };
}

async function submitFromDeviceStep(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.2636, longitude: 127.0286 });
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures/unknown-qr.png'));
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('button', { name: '현재 위치 다시 확인', exact: true })).toBeVisible();
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('업체 선택 검증 장소');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '연락처 화면 보기', exact: true }).click();
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/report\/complete$/);
}

for (const fixture of [
  { file: 'kakao-bike-qr.png', id: 'kakao-bike', name: '카카오 T 바이크', deviceId: 'AB1234' },
  { file: 'beam-qr.png', id: 'beam', name: '빔', deviceId: '7654321' },
]) test(`${fixture.id} QR and manual selection send the same canonical name to submission`, async ({ page }) => {
  const { aiRequests, submissions } = await captureOperatorRequests(page);
  for (const source of ['manual', 'qr']) {
    await page.goto('/report');
    if (source === 'qr') {
      await scan(page, fixture.file);
      await expect(page.getByRole('combobox', { name: '운영업체', exact: true })).toHaveValue(fixture.id);
    } else {
      await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
      await page.getByRole('combobox', { name: '운영업체', exact: true }).selectOption(fixture.id);
      await page.getByLabel('기기번호', { exact: true }).fill(fixture.deviceId);
    }
    await submitFromDeviceStep(page);
  }
  expect(aiRequests).toEqual([]);
  expect(submissions).toHaveLength(2);
  for (const body of submissions) {
    expect(body.operator).toBe(fixture.name);
    expect(body.deviceId).toBe(fixture.deviceId);
    expect(body).not.toHaveProperty('finalReportText');
    expect(body).not.toHaveProperty('reportConfirmed');
  }
  expect(submissions[0].qrRawData).toBeNull();
  expect(submissions[1].qrRawData).toEqual(expect.any(String));
});

test('changing a scanned company to a named company survives back navigation', async ({ page }) => {
  const { aiRequests, submissions } = await captureOperatorRequests(page);
  await scan(page, 'kakao-bike-qr.png');
  const operator = page.getByRole('combobox', { name: '운영업체', exact: true });
  await operator.selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('다른 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('OTHER-42');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(operator).toHaveValue('other');
  await expect(page.getByLabel('기타 업체명', { exact: true })).toHaveValue('다른 업체');
  await submitFromDeviceStep(page);
  expect(aiRequests).toEqual([]);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ operator: '다른 업체', deviceId: 'OTHER-42' });
});

test('QR that identifies only the operator still requires a device number without QR-step checkboxes', async ({ page }) => {
  const { aiRequests, submissions } = await captureOperatorRequests(page);
  await scan(page, 'gcoo-qr.png');
  await expect(page.getByLabel('운영업체', { exact: true })).toHaveValue('gcoo');
  await expect(page.getByLabel('기기번호', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('기기번호를 입력');
  await page.getByLabel('기기번호', { exact: true }).fill('123456');
  await submitFromDeviceStep(page);
  expect(aiRequests).toEqual([]);
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ operator: '지쿠', deviceId: '123456' });
});
