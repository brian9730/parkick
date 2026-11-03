import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/chatbot-live', workers: 1, reporter: 'list',
  outputDir: './test-results/chatbot-live',
  use: { baseURL: 'http://127.0.0.1:5190', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --import tsx backend/scripts/dev-chatbot-mock.ts --port 4030 --frontend-port 5190', url: 'http://127.0.0.1:4030/api/health', reuseExistingServer: false },
    { command: 'node frontend/scripts/dev-chatbot-mock.mjs --port 5190 --api-port 4030', url: 'http://127.0.0.1:5190', reuseExistingServer: false },
  ],
});
