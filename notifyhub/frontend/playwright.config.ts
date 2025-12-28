import { defineConfig, PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './__tests__/ui',
  timeout: 30000,
  expect: {
    timeout: 2000,
  },
  maxFailures: 1,
  use: {
    video: 'retain-on-failure',
    baseURL: process.env.BASE_URL || 'http://localhost:9080',
  },
  // webServer: {
  //   command: 'bun run dev',
  //   url: 'http://localhost:9030',
  //   reuseExistingServer: true,
  // },
};

export default defineConfig(config);