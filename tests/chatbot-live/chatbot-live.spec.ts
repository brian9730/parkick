import { test, expect } from '@playwright/test';

test('응답 대체 없이 실제 개발 서버의 자유 질문 Mock 답변을 확인한다', async ({ page }, testInfo) => {
  // page.route를 사용하지 않는다. Vite 프록시 → Express → Mock Provider 전체 경로 검증.
  const health = await page.request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).data.services).toEqual({ database: 'not-connected', ai: 'disabled', photoValidation: 'disabled', storage: 'not-connected' });
  const externalRequests: string[] = [];
  const chatRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(url.origin);
    if (url.pathname === '/api/chat') chatRequests.push(request.postData() ?? '');
  });
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByRole('button', { name: '신고는 어떻게 하나요?' }).click();
  await expect(panel.locator('.pk-chatbot-msg-bot').last()).toContainText('5단계');
  await expect(panel.locator('.pk-chatbot-msg-bot').last()).toContainText('1~2장');
  expect(chatRequests).toHaveLength(0);
  await panel.getByLabel('질문 입력').fill('도움이 필요해요');
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat' && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '메시지 보내기' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect((await response.json()).data.mode).toBe('mock');
  await expect(panel.getByRole('log')).toContainText('[Mock] 테스트용 Mock 안내입니다.');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '메시지 보내기' })).toBeDisabled();
  await expect(panel.getByLabel('질문 입력')).toBeEnabled();
  expect(chatRequests).toHaveLength(1);
  const firstRequest = JSON.parse(chatRequests[0]!);
  expect(firstRequest.question).toBe('도움이 필요해요');
  expect(firstRequest.history.map((turn: { role: string }) => turn.role)).toEqual(['user', 'assistant']);
  await panel.getByLabel('질문 입력').fill('좀 더 쉽게 설명해줘');
  const followupPromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat');
  await panel.getByRole('button', { name: '메시지 보내기' }).click();
  expect((await followupPromise).status()).toBe(200);
  expect(JSON.parse(chatRequests[1]!).history).toHaveLength(4);
  await panel.getByRole('button', { name: '대화 초기화' }).click();
  await expect(panel.getByRole('log')).not.toContainText('테스트용 Mock');
  await panel.getByLabel('질문 입력').fill('새로운 질문이에요');
  const resetPromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat');
  await panel.getByRole('button', { name: '메시지 보내기' }).click();
  expect((await resetPromise).status()).toBe(200);
  expect(JSON.parse(chatRequests[2]!).history).toEqual([]);
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('실제-백엔드-Mock-자유질문.png') });
});

test('실제 Mock 서버로 PC·태블릿·작은 화면·가로 화면의 스크롤과 입력 접근을 검증한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  for (let index = 0; index < 6; index++) await panel.getByRole('button', { name: '신고 후 어떻게 처리되나요?' }).click();
  await panel.getByLabel('질문 입력').fill('긴문장'.repeat(70));
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByLabel('질문 입력')).toBeEnabled();
  for (const viewport of [
    { width: 1440, height: 1000 }, { width: 768, height: 1024 },
    { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 480, height: 800 },
    { width: 844, height: 390 }, { width: 390, height: 300 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
    }).toBe(true);
    await expect(panel.getByRole('button', { name: '챗봇 닫기' })).toBeInViewport();
    await expect(panel.getByLabel('질문 입력')).toBeInViewport();
    const box = (await panel.boundingBox())!;
    if (viewport.width <= 680 || (viewport.width <= 900 && viewport.height <= 480)) {
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 26);
      expect(box.height).toBeGreaterThanOrEqual(viewport.height - 26);
    } else {
      expect(box.width).toBeLessThanOrEqual(400);
      expect(box.height).toBeLessThanOrEqual(640);
    }
    await expect.poll(() => panel.getByRole('log').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await panel.locator('.pk-chatbot-msg').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.getByRole('log').evaluate(element => { element.scrollTop = 0; });
    expect(await panel.getByRole('log').evaluate(element => element.scrollTop)).toBe(0);
  }
});

test('사진 개수 질문 후 용량 제한 질문의 실제 payload와 문맥 계약을 검증한다', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  const records: unknown[] = [];
  for (const question of ['사진을 몇 장까지 올릴 수 있어?', '용량 제한은?']) {
    await panel.getByLabel('질문 입력').fill(question);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat' && response.request().method() === 'POST');
    await panel.getByLabel('질문 입력').press('Enter');
    const response = await responsePromise;
    const payload = response.request().postDataJSON();
    const result = await response.json();
    records.push({ payload, status: response.status(), result });
    expect(response.status()).toBe(200);
    expect(result.data.mode).toBe('mock');
    expect(payload.question).toBe(question);
    if (question === '사진을 몇 장까지 올릴 수 있어?') expect(payload.history).toEqual([]);
    else {
      expect(payload.history.map((turn: { role: string }) => turn.role)).toEqual(['user', 'assistant']);
      expect(payload.history[0].content).toBe('사진을 몇 장까지 올릴 수 있어?');
      expect(payload.history[0].content.length).toBeLessThanOrEqual(300);
      expect(payload.history[1].content.length).toBeLessThanOrEqual(1500);
      expect(payload.history.reduce((sum: number, turn: { content: string }) => sum + turn.content.length, 0)).toBeLessThanOrEqual(3600);
    }
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect(panel.getByText(question, { exact: true })).toHaveCount(1);
  }
  await testInfo.attach('사진-질문-실제-요청과-응답', { body: JSON.stringify(records, null, 2), contentType: 'application/json' });
});

test('레이아웃 높이가 유지되는 키보드 상황을 시뮬레이션해 visualViewport 보정을 확인한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').focus();
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 320 });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 0 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => {
    const box = await panel.boundingBox();
    return box !== null && box.y >= 0 && box.y + box.height <= 320;
  }).toBe(true);
  for (const control of [panel.getByRole('button', { name: '챗봇 닫기' }), panel.getByLabel('질문 입력')]) {
    const box = await control.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  }
  await expect(panel.locator('details')).not.toHaveAttribute('open');
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(panel.getByRole('button', { name: '챗봇 닫기' })).toBeVisible();
});

test('일반적인 수거·반려·과거 견인 기록 질문을 단순 키워드로 차단하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  for (const question of ['수거 완료는 무슨 뜻인가요?', '반려는 무슨 뜻인가요?', '과거 견인 완료 기록은 무슨 뜻인가요?']) {
    await panel.getByLabel('질문 입력').fill(question);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chat');
    await panel.getByLabel('질문 입력').press('Enter');
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect((await response.json()).data.mode).toBe('mock');
    await expect(panel.getByRole('alert')).toHaveCount(0);
  }
});

test('홈 FAQ와 챗봇 안내가 현행 신고·사진 판별 흐름을 설명한다', async ({ page }) => {
  let chatCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/chat') chatCalls++; });
  await page.goto('/');
  await expect(page.locator('.faq-list summary')).toHaveText([
    '회원가입 없이 신고할 수 있나요?', '현장 사진을 찍을 때 무엇을 주의해야 하나요?',
    '신고 후에는 어떻게 처리되나요?', 'QR 코드를 읽을 수 없다면 어떻게 하나요?',
  ]);
  await expect(page.locator('.faq-list details')).toHaveCount(4);
  await expect(page.locator('details#photo-analysis')).toHaveCount(0);
  await page.locator('details#guide summary').click();
  await expect(page.locator('details#guide p')).toContainText('5단계');
  await expect(page.locator('details#guide p')).not.toContainText('신고문 확인');
  await page.locator('details#privacy summary').click();
  await expect(page.locator('details#privacy p')).toContainText('AI 사진 확인');
  await page.locator('details#process summary').click();
  await expect(page.locator('details#process p')).toContainText('전화번호');
  await expect(page.locator('details#process p')).not.toContainText('아직 연결되지 않았습니다');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').fill('사진에서 기기가 확인되지 않으면 어떻게 하나요?');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.locator('.pk-chatbot-msg-bot').last()).toContainText('다시 촬영하거나 첨부');
  expect(chatCalls).toBe(0);
  await expect(panel.locator('.pk-chatbot-chip')).toHaveCount(5);
  const cardAnswers = ['5단계', 'AI', '관리자'];
  for (let index = 0; index < 3; index++) {
    await panel.getByRole('button', { name: '챗봇 닫기', exact: true }).click();
    await page.locator('.help-grid button').nth(index).click();
    await expect(panel.locator('.pk-chatbot-msg-bot').last()).toContainText(cardAnswers[index]!);
  }
  await expect(page.locator('.faq-list details')).toHaveCount(4);
});
