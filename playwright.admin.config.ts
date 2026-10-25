import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

process.env.PARKICK_ADMIN_E2E_EMAIL ??= `admin-browser-${randomUUID()}@test.invalid`;
process.env.PARKICK_ADMIN_E2E_PASSWORD ??= randomBytes(24).toString('base64url');
process.env.PARKICK_ADMIN_E2E_STORAGE ??= resolve('test-results', `admin-evidence-${randomUUID()}`);

export default defineConfig({
  testDir: './tests/admin', testMatch: ['management.spec.ts', 'collection-mode.spec.ts'], globalSetup: './tests/setup-submission.ts',
  outputDir: './test-results/admin', fullyParallel: false, workers: 1, reporter: 'list',
  use: { baseURL: 'http://localhost:5177', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node --import tsx src/server.ts', cwd: './backend',
      url: 'http://127.0.0.1:4017/api/health', reuseExistingServer: false,
      env: {
        NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4017', FRONTEND_ORIGIN: 'http://localhost:5177',
        ENABLE_DEV_ADMIN: 'false', AI_PROVIDER: 'disabled',
        DATABASE_URL: 'postgresql://parkick_local@127.0.0.1:55432/parkick_test',
        PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
        REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: process.env.PARKICK_ADMIN_E2E_STORAGE,
        REPORT_REGION_CODE: 'local-development', TRUST_PROXY: 'false',
      },
    },
    {
      command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177 --strictPort', cwd: './frontend',
      url: 'http://localhost:5177', reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4017', VITE_NAVER_MAP_CLIENT_ID: '' },
    },
  ],
});
