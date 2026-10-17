import { resolve } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

const qrImage = resolve('tests/fixtures/unknown-qr.png');
const endpoint = '**/api/ai/generate-report';
const generationFields = ['additionalDescription', 'address', 'categories', 'deviceId', 'operator'];
const next = (page: Page) => page.getByRole('button', { name: '다음 단계', exact: true }).click();
const back = (page: Page) => page.getByRole('button', { name: '이전', exact: true }).click();
const textField = (page: Page) => page.getByLabel('신고 내용', { exact: true });
const reviewed = (page: Page) => page.getByLabel('신고 내용을 확인했습니다.', { exact: true });
const suggestion = (page: Page) => page.getByRole('region', { name: '생성된 신고문 제안', exact: true });
const generate = (page: Page) => page.getByRole('button', { name: /^개발용 문구 (다시 )?생성$/ }).click();
const contact = (page: Page) => page.getByRole('button', { name: '연락처 화면 보기', exact: true }).click();

function mockResult(generatedText: string) {
  return { data: { mode: 'mock', generatedText, modelId: 'mock-template-v1', promptVersion: 'parkick-report-v1', latencyMs: 1, inputTokens: null, outputTokens: null } };
}

async function reportTextStep(page: Page, withQr = false) {
  await page.goto('/report');
  if (withQr) {
    await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(qrImage);
    await expect(page.getByText('업체를 자동으로 확인할 수 없습니다.', { exact: false })).toBeVisible();
  } else {
    await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  }
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사용자가 확인한 업체');
  await page.getByLabel('기기번호 확인 불가', { exact: true }).uncheck();
  await page.getByLabel('기기번호', { exact: true }).fill('TEST-PHASE3');
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.').check();
  await next(page);
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(qrImage);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.2636');
  await page.getByLabel('경도', { exact: true }).fill('127.0286');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('테스트 공원 입구');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await next(page);
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '기타', exact: true }).click();
  await page.getByLabel('추가 설명', { exact: true }).fill('입구 쪽 통행이 어려운 상황입니다.');
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('신고 내용을 확인해 주세요');
}

async function holdGeneration(page: Page) {
  let receive!: (route: Route) => void;
  const request = new Promise<Route>(resolveRequest => { receive = resolveRequest; });
  await page.route(endpoint, route => { receive(route); });
  return { request };
}

test('real Mock generation requires explicit use and review, and never sends contact, QR, or photo data', async ({ page }, testInfo) => {
  const bodies: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/ai/generate-report')) bodies.push(request.postDataJSON());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await reportTextStep(page, true);
  await expect(page.getByText('개발용 Mock 모드', { exact: true })).toBeVisible();
  const firstResponse = page.waitForResponse('/api/ai/generate-report');
  await generate(page);
  const response = await firstResponse;
  expect(response.status()).toBe(200);
  const result = (await response.json()).data;
  expect(result.mode).toBe('mock');
  expect(result.generatedText.length).toBeGreaterThan(0);
  await expect(suggestion(page)).toContainText(result.generatedText);
  await expect(page.getByText('개발용 Mock 문구 · 실제 AI 생성 아님', { exact: true })).toBeVisible();
  await expect(textField(page)).toHaveValue('');
  await page.getByRole('button', { name: '이 내용 사용', exact: true }).click();
  await expect(textField(page)).toHaveValue(result.generatedText);
  await expect(reviewed(page)).not.toBeChecked();
  await reviewed(page).check();
  await page.screenshot({ path: testInfo.outputPath('mock-reviewed-mobile.png'), fullPage: true });
  await contact(page);
  await expect(page.getByLabel('휴대전화 번호 (선택)', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /번호 입력 시 필수/ })).toHaveCount(0);
  await page.getByLabel('휴대전화 번호 (선택)', { exact: true }).fill('01000000000');
  await page.getByRole('checkbox', { name: /번호 입력 시 필수/ }).check();
  await back(page);
  const secondResponse = page.waitForResponse('/api/ai/generate-report');
  await generate(page);
  expect((await secondResponse).status()).toBe(200);
  await expect(page.getByRole('button', { name: '개발용 문구 다시 생성', exact: true })).toBeEnabled();
  expect(bodies).toHaveLength(2);
  for (const body of bodies) {
    expect(Object.keys(body).sort()).toEqual(generationFields);
    expect(body).toMatchObject({ operator: '사용자가 확인한 업체', deviceId: 'TEST-PHASE3', address: '테스트 공원 입구', categories: ['보행로 통행 방해', '기타'], additionalDescription: '입구 쪽 통행이 어려운 상황입니다.' });
    expect(JSON.stringify(body)).not.toContain('01000000000');
    expect(JSON.stringify(body)).not.toContain('unverified.example.invalid');
  }
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByLabel('휴대전화 번호 (선택)', { exact: true })).toHaveValue('010-0000-0000');
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('generation and regeneration preserve manual writing until a suggestion is explicitly used', async ({ page }) => {
  let generation = 0;
  await page.route(endpoint, route => route.fulfill({ json: mockResult(++generation === 1 ? '첫 번째 생성 제안입니다.' : '두 번째 생성 제안입니다.') }));
  await reportTextStep(page);
  await textField(page).fill('사용자가 직접 확인하고 작성한 내용입니다.');
  await reviewed(page).check();
  await generate(page);
  await expect(suggestion(page)).toContainText('첫 번째 생성 제안입니다.');
  await expect(textField(page)).toHaveValue('사용자가 직접 확인하고 작성한 내용입니다.');
  await page.getByRole('button', { name: '이 내용 사용', exact: true }).click();
  await expect(textField(page)).toHaveValue('첫 번째 생성 제안입니다.');
  await expect(reviewed(page)).not.toBeChecked();
  await textField(page).fill('현장에서 확인한 사실을 추가로 수정했습니다.');
  await reviewed(page).check();
  await generate(page);
  await expect(suggestion(page)).toContainText('두 번째 생성 제안입니다.');
  await expect(textField(page)).toHaveValue('현장에서 확인한 사실을 추가로 수정했습니다.');
  await page.getByRole('button', { name: '이 내용 사용', exact: true }).click();
  await expect(textField(page)).toHaveValue('두 번째 생성 제안입니다.');
  await expect(reviewed(page)).not.toBeChecked();
});

test('provider failure retains the draft and permits reviewed manual continuation', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ status: 503, json: { error: { code: 'AI_UNAVAILABLE', message: '자동 작성 연결을 확인할 수 없습니다.' } } }));
  await reportTextStep(page);
  await textField(page).fill('자동 작성 전 직접 작성한 내용입니다.');
  await generate(page);
  await expect(page.getByRole('alert')).toContainText('자동 작성 연결을 확인할 수 없습니다.');
  await expect(textField(page)).toHaveValue('자동 작성 전 직접 작성한 내용입니다.');
  await textField(page).fill('사진과 현장에서 직접 확인한 상황을 작성했습니다.');
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('연락처 입력 (선택)');
});

test('blank content and unreviewed edits cannot reach the optional contact step', async ({ page }) => {
  await reportTextStep(page);
  await contact(page);
  await expect(page.locator('.wizard-validation')).toContainText('신고 내용을 1~2,000자로 작성해 주세요.');
  await textField(page).fill('   ');
  await contact(page);
  await expect(page.locator('.wizard-validation')).toContainText('신고 내용을 1~2,000자로 작성해 주세요.');
  await textField(page).fill('직접 작성한 신고 내용입니다.');
  await contact(page);
  await expect(page.locator('.wizard-validation')).toContainText('신고 내용을 확인한 뒤 확인란을 선택해 주세요.');
  await reviewed(page).check();
  await expect(page.locator('.wizard-validation')).toHaveCount(0);
  await textField(page).fill('확인 이후에 내용을 수정했습니다.');
  await expect(reviewed(page)).not.toBeChecked();
  await contact(page);
  await expect(page.locator('.wizard-validation')).toContainText('신고 내용을 확인한 뒤 확인란을 선택해 주세요.');
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByLabel('휴대전화 번호 (선택)', { exact: true })).toHaveValue('');
});

test('changing source facts invalidates review and older suggestions while preserving the written draft', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: mockResult('원래 입력에 따른 제안입니다.') }));
  await reportTextStep(page);
  await generate(page);
  await expect(suggestion(page)).toContainText('원래 입력에 따른 제안입니다.');
  await page.getByRole('button', { name: '이 내용 사용', exact: true }).click();
  await reviewed(page).check();
  await back(page);
  await page.getByLabel('추가 설명', { exact: true }).fill('수정한 현장 상황입니다.');
  await next(page);
  await expect(textField(page)).toHaveValue('원래 입력에 따른 제안입니다.');
  await expect(reviewed(page)).not.toBeChecked();
  await expect(page.getByRole('button', { name: '이 내용 사용', exact: true })).toBeDisabled();
  await contact(page);
  await expect(page.locator('.wizard-validation')).toContainText('신고 내용을 확인한 뒤 확인란을 선택해 주세요.');
  await textField(page).fill('수정한 현장 상황을 반영한 수동 작성입니다.');
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('연락처 입력 (선택)');
});

test('manual editing cancels a pending generation and a late response cannot replace it', async ({ page }) => {
  const pending = await holdGeneration(page);
  await reportTextStep(page);
  await textField(page).fill('생성 요청 전의 수동 내용입니다.');
  await generate(page);
  const route = await pending.request;
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/ai/generate-report'));
  await textField(page).fill('기다리는 동안 현장 내용을 직접 수정했습니다.');
  await canceled;
  await route.fulfill({ json: mockResult('늦게 도착해 적용되면 안 되는 제안입니다.') });
  await expect(textField(page)).toHaveValue('기다리는 동안 현장 내용을 직접 수정했습니다.');
  await expect(suggestion(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '생성 취소', exact: true })).toHaveCount(0);
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('연락처 입력 (선택)');
});

test('leaving the content step cancels generation and preserves writing on return', async ({ page }) => {
  const pending = await holdGeneration(page);
  await reportTextStep(page);
  await textField(page).fill('뒤로 이동해도 보존할 신고 내용입니다.');
  await generate(page);
  const route = await pending.request;
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/ai/generate-report'));
  await back(page);
  await canceled;
  await route.fulfill({ json: mockResult('이탈 후 도착하여 무시할 제안입니다.') });
  await next(page);
  await expect(textField(page)).toHaveValue('뒤로 이동해도 보존할 신고 내용입니다.');
  await expect(suggestion(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '개발용 문구 생성', exact: true })).toBeEnabled();
});

test('an unconfigured provider permits manual reporting without issuing a generation request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/ai/generate-report')) requests.push(request.url()); });
  await page.route('**/api/ai/status', route => route.fulfill({ json: { data: { mode: 'disabled', available: false } } }));
  await reportTextStep(page);
  await expect(page.getByRole('button', { name: '신고문 자동 작성 미사용', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^(AI 신고문|개발용 문구) (다시 )?생성$/ })).toHaveCount(0);
  await textField(page).fill('자동 작성 없이 현장에서 확인한 내용을 직접 작성합니다.');
  await reviewed(page).check();
  await contact(page);
  await expect(page.getByLabel('휴대전화 번호 (선택)', { exact: true })).toHaveValue('');
  expect(requests).toEqual([]);
});
