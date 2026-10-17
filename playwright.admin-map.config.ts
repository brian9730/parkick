import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

process.env.PARKICK_ADMIN_MAP_E2E_EMAIL ??= `admin-map-${randomUUID()}@test.invalid`;
process.env.PARKICK_ADMIN_MAP_E2E_PASSWORD ??= randomBytes(24).toString('base64url');

export default defineConfig({
  testDir: './tests/admin', testMatch: 'admin-map.spec.ts', globalSetup: './tests/setup-submission.ts',
  outputDir: './test-results/admin-map', fullyParallel: false, workers: 1, reporter: 'list',
  use: { baseURL: 'http://localhost:5179', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node --import tsx src/server.ts', cwd: './backend',
      url: 'http://127.0.0.1:4019/api/health', reuseExistingServer: false,
      env: {
        NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4019', FRONTEND_ORIGIN: 'http://localhost:5179',
        ENABLE_DEV_ADMIN: 'false', AI_PROVIDER: 'disabled',
        DATABASE_URL: 'postgresql://parkick_local@127.0.0.1:55432/parkick_test',
        PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
        REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: resolve('test-results', `admin-map-evidence-${randomUUID()}`),
        REPORT_REGION_CODE: 'local-development', TRUST_PROXY: 'false',
      },
    },
    {
      command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179 --strictPort', cwd: './frontend',
      url: 'http://localhost:5179', reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4019', VITE_API_BASE_URL: '/api', VITE_NAVER_MAP_CLIENT_ID: 'parkick-map-sdk-test-only' },
    },
  ],
});
