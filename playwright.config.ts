import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

// Ephemeral credentials belong only to the isolated test servers, never the application.
process.env.PARKICK_E2E_ADMIN_EMAIL ??= 'browser-test@example.invalid';
process.env.PARKICK_E2E_ADMIN_PASSWORD ??= randomBytes(24).toString('base64url');

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: './backend',
      url: 'http://127.0.0.1:4015/api/health',
      reuseExistingServer: false,
      env: {
        // Exercise the local developer setup, including its two loopback hostnames.
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: '4015',
        FRONTEND_ORIGIN: 'http://localhost:5175',
        ENABLE_DEV_ADMIN: 'true',
        DEV_ADMIN_EMAIL: process.env.PARKICK_E2E_ADMIN_EMAIL,
        DEV_ADMIN_PASSWORD: process.env.PARKICK_E2E_ADMIN_PASSWORD,
        // Browser tests must never invoke a paid or externally configured AI provider.
        AI_PROVIDER: 'mock',
        // Keep this suite independent of the developer's local database.
        DATABASE_URL: '',
        REPORT_STORAGE_PROVIDER: 'local',
        TRUST_PROXY: 'false',
      },
    },
    {
      command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort',
      cwd: './frontend',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4015', VITE_NAVER_MAP_CLIENT_ID: '' },
    },
  ],
});
