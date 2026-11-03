import { expect, test } from '@playwright/test';

test('development loopback IP supports browser login, authenticated reads, QR parsing, and logout', async ({ page, context }) => {
  // The isolated backend allows localhost:5175; Vite commonly advertises 127.0.0.1:5175.
  // Use browser requests so Origin and cookies follow the real UI, rather than the API fixture's baseURL.
  const origin = 'http://127.0.0.1:5175';
  await page.goto(`${origin}/admin/dashboard`);
  await expect(page).toHaveURL(`${origin}/admin/login`);
  await page.getByLabel('이메일', { exact: true }).fill(process.env.PARKICK_E2E_ADMIN_EMAIL!);
  await page.getByLabel('비밀번호', { exact: true }).fill(process.env.PARKICK_E2E_ADMIN_PASSWORD!);
  const loginResponse = page.waitForResponse(response => response.url() === `${origin}/api/admin/auth/login` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const login = await loginResponse;
  expect(await login.request().headerValue('origin')).toBe(origin);
  expect(login.status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/admin/dashboard`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('대시보드');

  const cookie = (await context.cookies(`${origin}/api/admin/auth/me`)).find(item => item.name === 'parkick_admin_session');
  expect(cookie).toMatchObject({ domain: '127.0.0.1', httpOnly: true });
  expect(await page.evaluate(async () => (await fetch('/api/admin/dashboard', { credentials: 'include' })).status)).toBe(200);

  const rawQr = 'https://unverified.example.invalid/device/loopback-origin-test';
  const parsed = await page.evaluate(async raw => {
    const response = await fetch('/api/qr/parse', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawQr: raw }),
    });
    return { status: response.status, body: await response.json() };
  }, rawQr);
  expect(parsed.status).toBe(200);
  expect(parsed.body.data).toMatchObject({ rawQr, matched: false, source: 'unknown' });

  const logoutResponse = page.waitForResponse(response => response.url() === `${origin}/api/admin/auth/logout` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(`${origin}/admin/login`);
  expect(await page.evaluate(async () => (await fetch('/api/admin/dashboard', { credentials: 'include' })).status)).toBe(401);
  expect((await context.cookies(`${origin}/api/admin/auth/me`)).some(item => item.name === 'parkick_admin_session')).toBe(false);
});
