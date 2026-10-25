import { defineConfig } from '@playwright/test';

// Isolated map adapter checks. The browser SDK and API are intercepted by tests;
// this intentionally invalid public key never contacts a real map account.
export default defineConfig({
  testDir: './tests',
  testMatch: ['map-feature.spec.ts', 'collection-map.spec.ts'],
  outputDir: './test-results/map-feature',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5188',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort',
    cwd: './frontend',
    url: 'http://localhost:5188',
    reuseExistingServer: false,
    env: { VITE_NAVER_MAP_CLIENT_ID: 'parkick-map-sdk-test-only' },
  },
});
