import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// These are browser lifecycle tests with a simulated camera, not physical camera/permission tests.
// The QR success case still uses qr-scanner's actual decoder against a fixture in the video frames.
type CameraMode = 'ready' | 'pending' | 'denied';
interface CameraTestState {
  mode: CameraMode;
  requests: number;
  streams: MediaStream[];
  tracks: MediaStreamTrack[];
  pending: (() => void)[];
}
type CameraWindow = typeof window & { __cameraTest: CameraTestState };

async function installSimulatedCamera(page: Page, mode: CameraMode = 'ready', qrDataUrl: string | null = null) {
  await page.addInitScript(({ initialMode, imageSource }) => {
    const cameraWindow = window as CameraWindow;
    const state: CameraTestState = { mode: initialMode, requests: 0, streams: [], tracks: [], pending: [] };
    cameraWindow.__cameraTest = state;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        state.requests += 1;
        if (state.mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
        if (state.mode === 'pending') await new Promise<void>(resolve => state.pending.push(resolve));
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (imageSource) {
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
            image.src = imageSource;
          });
          context.drawImage(image, 140, 140, 320, 320);
        }
        const stream = canvas.captureStream(12);
        const track = stream.getVideoTracks()[0];
        const originalStop = track.stop.bind(track);
        let tick = 0;
        // Produce frames without modifying the QR area.
        const timer = window.setInterval(() => {
          context.fillStyle = tick++ % 2 ? '#fff' : '#eee';
          context.fillRect(0, 0, 2, 2);
        }, 70);
        track.stop = () => { window.clearInterval(timer); originalStop(); };
        state.streams.push(stream);
        state.tracks.push(track);
        return stream;
      },
    });
  }, { initialMode: mode, imageSource: qrDataUrl });
}

async function trackStates(page: Page) {
  // qr-scanner removes stopped tracks from MediaStream; retain the original track objects to verify termination.
  return page.evaluate(() => (window as CameraWindow).__cameraTest.tracks.map(track => track.readyState));
}

async function startCamera(page: Page) {
  await page.getByRole('button', { name: '카메라로 QR 스캔', exact: true }).click();
}

test('simulated camera: permission denial leaves the manual reporting route usable', async ({ page }) => {
  await installSimulatedCamera(page, 'denied');
  await page.goto('/report');
  expect(await page.evaluate(() => (window as CameraWindow).__cameraTest.requests)).toBe(0);
  await startCamera(page);
  await expect(page.getByRole('alert')).toContainText('카메라 권한');
  expect(await trackStates(page)).toEqual([]);
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('unknown');
  await page.getByLabel('기기번호 확인 불가', { exact: true }).check();
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.', { exact: true }).check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
});

test('simulated camera: repeated stop/start and leaving the QR step release only owned tracks', async ({ page }) => {
  await installSimulatedCamera(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/report');
  await startCamera(page);
  await expect.poll(() => trackStates(page)).toEqual(['live']);
  await page.getByRole('button', { name: '카메라 중지', exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(['ended']);
  await startCamera(page);
  await expect.poll(() => trackStates(page)).toEqual(['ended', 'live']);
  // qr-scanner has deferred stream cleanup after 300ms; it must not stop the newer session.
  await page.waitForTimeout(450);
  expect(await trackStates(page)).toEqual(['ended', 'live']);
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('unknown');
  await page.getByLabel('기기번호 확인 불가', { exact: true }).check();
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.', { exact: true }).check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended']);
  expect(errors).toEqual([]);
});

test('simulated camera: cancelling pending permission then restarting ignores the late old stream', async ({ page }) => {
  await installSimulatedCamera(page, 'pending');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/report');
  await startCamera(page);
  await expect.poll(() => page.evaluate(() => (window as CameraWindow).__cameraTest.pending.length)).toBe(1);
  await page.getByRole('button', { name: '카메라 중지', exact: true }).click();
  await page.evaluate(() => { (window as CameraWindow).__cameraTest.mode = 'ready'; });
  await startCamera(page);
  await expect.poll(() => trackStates(page)).toEqual(['live']);
  await page.evaluate(() => (window as CameraWindow).__cameraTest.pending.shift()?.());
  await expect.poll(() => trackStates(page)).toEqual(['live', 'ended']);
  await page.waitForTimeout(450);
  expect(await trackStates(page)).toEqual(['live', 'ended']);
  await page.getByRole('link', { name: '홈으로', exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended']);
  expect(errors).toEqual([]);
});

test('simulated camera: navigating away before permission resolves stops the late stream', async ({ page }) => {
  await installSimulatedCamera(page, 'pending');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/report');
  await startCamera(page);
  await expect.poll(() => page.evaluate(() => (window as CameraWindow).__cameraTest.pending.length)).toBe(1);
  await page.getByRole('link', { name: '홈으로', exact: true }).click();
  await page.evaluate(() => (window as CameraWindow).__cameraTest.pending.shift()?.());
  await expect.poll(() => trackStates(page)).toEqual(['ended']);
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('simulated camera with actual QR decoding: a successful scan stops the camera and parses once', async ({ page }, testInfo) => {
  const fixture = readFileSync(resolve(testInfo.project.testDir, '../fixtures/unknown-qr.png'));
  await installSimulatedCamera(page, 'ready', `data:image/png;base64,${fixture.toString('base64')}`);
  const parses: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/qr/parse')) parses.push(request.postData() || '');
  });
  await page.goto('/report');
  await startCamera(page);
  await expect(page.getByText('업체를 자동으로 확인할 수 없습니다.', { exact: false })).toBeVisible();
  await expect.poll(() => trackStates(page)).toEqual(['ended']);
  await expect(page.getByText('읽은 QR 원문 확인', { exact: false })).toBeVisible();
  expect(parses).toHaveLength(1);
});
