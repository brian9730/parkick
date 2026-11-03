import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/chatbot', testMatch: '*.spec.ts', workers: 1,
  outputDir: './test-results/chatbot', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5179', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx tests/chatbot/server.ts', url: 'http://127.0.0.1:5179', reuseExistingServer: false },
});
