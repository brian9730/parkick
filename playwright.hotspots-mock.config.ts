import { defineConfig } from '@playwright/test';

// Frontend-only dashboard check. The spec intercepts every admin API request
// and substitutes the NAVER SDK, so no backend, database, or map key is needed.
export default defineConfig({
  testDir: './tests/admin',
  testMatch: 'hotspot-toggle-mock.spec.ts',
  outputDir: './test-results/hotspots-mock',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5197',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort',
    cwd: './frontend',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: process.env.PARKICK_HOTSPOT_MOCK_REUSE_VITE === '1',
    env: {
      VITE_API_BASE_URL: '/api',
      VITE_NAVER_MAP_CLIENT_ID: 'parkick-hotspot-sdk-test-only',
      API_PROXY_TARGET: 'http://127.0.0.1:49999',
    },
  },
});
