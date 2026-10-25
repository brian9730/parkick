import { defineConfig } from '@playwright/test';

// Frontend-only collection checks. Every /api request is intercepted by the
// spec, so this suite does not need a database, backend server, or credentials.
export default defineConfig({
  testDir: './tests/admin',
  testMatch: 'collection-field-flow.spec.ts',
  outputDir: './test-results/collection-mock',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5186',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186 --strictPort',
    cwd: './frontend',
    url: 'http://localhost:5186',
    reuseExistingServer: process.env.PARKICK_COLLECTION_MOCK_REUSE_VITE === '1',
    env: { VITE_NAVER_MAP_CLIENT_ID: '', API_PROXY_TARGET: 'http://127.0.0.1:49999' },
  },
});
