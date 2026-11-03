import { expect, test, type Page } from '@playwright/test';

type CameraWindow = typeof window & { __photoTestTracks: MediaStreamTrack[] };

async function mockCamera(page: Page, denied = false) {
  await page.addInitScript(({ deny }) => {
    const tracks: MediaStreamTrack[] = [];
    (window as CameraWindow).__photoTestTracks = tracks;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#7ec9d1';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(12);
        const track = stream.getVideoTracks()[0]!;
        const originalStop = track.stop.bind(track);
        let tick = 0;
        const timer = window.setInterval(() => {
          context.fillStyle = tick++ % 2 === 0 ? '#222' : '#333';
          context.fillRect(0, 0, 1, 1);
        }, 80);
        track.stop = () => { window.clearInterval(timer); originalStop(); };
        tracks.push(track);
        return stream;
      },
    });
  }, { deny: denied });
}

async function openPhotoStep(page: Page) {
  await page.route('**/api/reports/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { available: true, mode: 'local', photoValidation: 'litellm' } }),
  }));
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('테스트 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('TEST-123');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
}

test('live guidance samples a camera frame, shows the server hint, and releases the camera after capture', async ({ page }) => {
  await mockCamera(page);
  let guidanceCalls = 0;
  await page.route('**/api/reports/photo/live-guidance', async route => {
    guidanceCalls += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataBuffer()?.length).toBeGreaterThan(0);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { status: 'move_closer', message: '기기가 화면에서 작게 보여요. 조금 더 가까이 촬영해 주세요.' } }),
    });
  });
  await openPhotoStep(page);
  await expect(page.locator('.photo-live-preflight')).toContainText('카메라 화면을 AI로 전송합니다');
  await page.getByRole('button', { name: '실시간 안내 촬영' }).click();
  await expect(page.locator('.photo-live-camera')).toBeVisible();
  await expect(page.locator('.photo-live-guidance')).toHaveAttribute('data-guidance-status', 'move_closer', { timeout: 15_000 });
  await expect(page.locator('.photo-live-guidance')).toContainText('조금 더 가까이');
  await page.getByRole('button', { name: '사진 찍기' }).click();
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as CameraWindow).__photoTestTracks;
    return tracks.length > 0 && tracks.every(track => track.readyState === 'ended');
  })).toBe(true);
  expect(guidanceCalls).toBeGreaterThan(0);
  await page.getByRole('button', { name: '사진 1 다시 촬영' }).click();
  await expect(page.getByRole('button', { name: '다음 단계' })).toBeDisabled();
  await page.getByRole('button', { name: '카메라 닫기' }).click();
  await expect(page.getByRole('button', { name: '다음 단계' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as CameraWindow).__photoTestTracks;
    return tracks.length > 0 && tracks.every(track => track.readyState === 'ended');
  })).toBe(true);
  await page.goto('about:blank');
});

test('camera permission denial preserves native camera fallback', async ({ page }) => {
  await mockCamera(page, true);
  await openPhotoStep(page);
  await page.getByRole('button', { name: '실시간 안내 촬영' }).click();
  await expect(page.getByRole('button', { name: '기본 카메라로 촬영' })).toBeVisible();
  await expect(page.locator('.photo-live-camera [role="alert"]')).toBeVisible();
  expect(await page.evaluate(() => (window as CameraWindow).__photoTestTracks.length)).toBe(0);
  await page.goto('about:blank');
});
