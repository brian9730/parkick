import { test, expect } from '@playwright/test';

test('중계 API 응답 모드를 표시할 수 있다 (실제 LLM 호출 검증 아님)', async ({ page }) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  await page.route('**/api/chat', route => route.fulfill({ json: { data: { mode: 'gateway', answer: '중계 API 응답 형식 테스트입니다.' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').fill('안녕');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('log')).toContainText('중계 API 응답 형식 테스트입니다.');
  await expect(panel.getByRole('log')).not.toContainText('[Mock]');
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('FAQ stays local; unmatched questions show loading, prevent duplicates and retry without duplicate user messages', async ({ page }) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  let calls = 0;
  let firstBody = '';
  let release: (() => void) | undefined;
  await page.route('**/api/chat', async route => {
    calls++;
    expect(route.request().postDataJSON().question).toBe('도움이 필요해요');
    expect(route.request().postDataJSON().history.length).toBeLessThanOrEqual(6);
    if (calls === 1) firstBody = route.request().postData()!;
    else expect(route.request().postData()).toBe(firstBody);
    if (calls === 1) {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ status: 503, json: { error: { message: '잠시 후 다시 시도해 주세요.' } } });
    } else await route.fulfill({ json: { data: { mode: 'mock', answer: 'Mock 테스트 안내입니다.' } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByRole('button', { name: '신고는 어떻게 하나요?' }).click();
  await expect(panel.getByRole('log')).toContainText('회원가입 없이');
  await panel.getByLabel('질문 입력').fill('신고는 어떻게 하나요?');
  await panel.getByRole('button', { name: '메시지 보내기' }).click();
  expect(calls).toBe(0);
  await panel.getByLabel('질문 입력').fill('도움이 필요해요');
  await panel.getByRole('button', { name: '메시지 보내기' }).click();
  await expect(panel.getByRole('status')).toContainText('답변을 준비');
  await expect(panel.getByRole('button', { name: '메시지 보내기' })).toBeDisabled();
  // Recommendation buttons remain available even while the external request is pending.
  await panel.getByRole('button', { name: 'QR 코드를 읽을 수 없다면?' }).click();
  await expect(panel.getByRole('log')).toContainText('기기번호');
  expect(calls).toBe(1);
  release!();
  await expect(panel.getByRole('alert')).toContainText('잠시 후');
  await panel.getByRole('button', { name: '다시 시도' }).click();
  await expect(panel.getByRole('log')).toContainText('[Mock] Mock 테스트 안내');
  expect(calls).toBe(2);
  await expect(panel.getByText('도움이 필요해요', { exact: true })).toHaveCount(1);
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('초기화는 진행 중 요청을 취소하고 늦은 응답과 문맥을 제거한다', async ({ page }) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  let release: (() => void) | undefined;
  let handled: (() => void) | undefined;
  const done = new Promise<void>(resolve => { handled = resolve; });
  let calls = 0;
  await page.route('**/api/chat', async route => {
    calls++;
    if (calls === 1) {
      await new Promise<void>(resolve => { release = resolve; });
      try { await route.fulfill({ json: { data: { mode: 'mock', answer: '취소된 오래된 답변' } } }); }
      finally { handled!(); }
    } else {
      expect(route.request().postDataJSON().history).toEqual([]);
      await route.fulfill({ json: { data: { mode: 'mock', answer: '새 대화 답변' } } });
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').fill('도움이 필요해요');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('status')).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  await panel.getByRole('button', { name: '대화 초기화' }).click();
  release!();
  await done;
  await expect(panel.getByRole('status')).toHaveCount(0);
  await expect(panel.getByLabel('질문 입력')).toBeEnabled();
  await panel.getByLabel('질문 입력').fill('새로운 질문');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('log')).toContainText('새 대화 답변');
  await expect(panel.getByRole('log')).not.toContainText('취소된 오래된 답변');
});

test('개인정보 오류는 무의미한 재시도 대신 질문 수정을 안내한다', async ({ page }) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  await page.route('**/api/chat', route => route.fulfill({ status: 400, json: { error: { message: '개인정보를 빼고 질문해 주세요.' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').fill('이메일 test@example.invalid');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('alert')).toContainText('수정해서 보내');
  await expect(panel.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await expect(panel.getByLabel('질문 입력')).toHaveValue('이메일 test@example.invalid');
});

test('실패한 질문을 입력창에서 다시 보내도 사용자 말풍선은 중복되지 않는다', async ({ page }) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  let attempts = 0;
  let originalBody = '';
  await page.route('**/api/chat', route => {
    attempts++;
    if (attempts === 1) {
      originalBody = route.request().postData()!;
      return route.fulfill({ status: 400, json: { error: { message: '입력값의 형식을 확인해주세요.' } } });
    }
    expect(route.request().postData()).toBe(originalBody);
    return route.fulfill({ json: { data: { mode: 'mock', answer: '정상 답변' } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '챗봇 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await panel.getByLabel('질문 입력').fill('용량 제한은?');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('alert')).toContainText('입력값의 형식');
  await expect(panel.getByLabel('질문 입력')).toHaveValue('용량 제한은?');
  await panel.getByLabel('질문 입력').press('Enter');
  await expect(panel.getByRole('log')).toContainText('정상 답변');
  await expect(panel.getByText('용량 제한은?', { exact: true })).toHaveCount(1);
});

test('모바일·작은 화면에서 추천 질문 접기와 키보드 조작이 가능하다', async ({ page }, testInfo) => {
  await page.route('**/api/admin/**', route => route.fulfill({ status: 401, json: { error: { message: '테스트' } } }));
  await page.route('**/api/chat', route => route.fulfill({ json: { data: { mode: 'mock', answer: '테스트용 안내입니다.' } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const launcher = page.getByRole('button', { name: '챗봇 열기', exact: true });
  await launcher.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: '파킥 안내 챗봇' });
  await expect(panel.getByRole('button', { name: '챗봇 닫기' })).toBeFocused();
  await expect(panel.getByRole('img', { name: '파킥', exact: true })).toBeVisible();
  const recommendations = panel.locator('summary');
  await recommendations.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: '신고는 어떻게 하나요?' })).toBeHidden();
  await page.keyboard.press('Space');
  await expect(panel.getByRole('button', { name: '신고는 어떻게 하나요?' })).toBeVisible();
  await panel.getByLabel('질문 입력').fill('신고는 어떻게 하나요?');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('log')).toContainText('회원가입 없이');
  await expect(panel.locator('.pk-chatbot-msg-user').last()).toHaveCSS('background-color', 'rgb(0, 72, 160)');
  await page.screenshot({ path: testInfo.outputPath('chatbot-mobile.png') });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 420 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(panel.getByLabel('질문 입력')).toBeInViewport();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('chatbot-desktop.png') });
  await panel.getByLabel('질문 입력').focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: '챗봇 열기', exact: true })).toBeFocused();
});
