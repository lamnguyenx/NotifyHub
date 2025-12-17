import { defineConfig, PlaywrightTestConfig } from '@playwright/test';

const isRemoteChrome: boolean = !!process.env.WEBSOCKET_ENDPOINT;

const config: PlaywrightTestConfig = {
  testDir: 'tests/ui',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:5173',
    ...(isRemoteChrome ? {
      browserWSEndpoint: process.env.WEBSOCKET_ENDPOINT,
    } : {
      // Local Chrome launch configuration
      launchOptions: {
        args: [
          '--remote-debugging-port=9222',
          '--remote-debugging-address=0.0.0.0',
        ],
      },
    }),
  },
  webServer: {
    command: 'cd web && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
   },
};

export default defineConfig(config);