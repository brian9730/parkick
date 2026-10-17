import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// This suite can only use the isolated project test DB, never backend/.env's DB.
const databaseUrl = 'postgresql://parkick_local@127.0.0.1:55432/parkick_test';
const encryptionKey = randomBytes(32).toString('base64');
const lookupKey = randomBytes(32).toString('base64');

export default defineConfig({
  testDir: './tests/submission',
  testMatch: ['**/phase-four.spec.ts', '**/aws-mode.spec.ts', '**/phase-five.spec.ts'],
  globalSetup: './tests/setup-submission.ts',
  outputDir: './test-results/submission',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5176', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node --import tsx src/server.ts', cwd: './backend',
      url: 'http://127.0.0.1:4016/api/health', reuseExistingServer: false,
      env: {
        NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '4016', FRONTEND_ORIGIN: 'http://localhost:5176',
        ENABLE_DEV_ADMIN: 'false', AI_PROVIDER: 'mock', DATABASE_URL: databaseUrl,
        PHONE_ENCRYPTION_KEY: encryptionKey, PHONE_LOOKUP_HMAC_KEY: lookupKey,
        REPORT_REGION_CODE: 'local-development', REPORT_STORAGE_PROVIDER: 'local', TRUST_PROXY: 'false',
        REPORT_STORAGE_DIR: resolve('test-results/submission-evidence'),
      },
    },
    {
      command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5176 --strictPort', cwd: './frontend',
      url: 'http://localhost:5176', reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4016', VITE_NAVER_MAP_CLIENT_ID: '' },
    },
  ],
});
