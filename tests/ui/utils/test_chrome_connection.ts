import { chromium } from '@playwright/test';
import * as http from 'http';

interface ChromeTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
  parentId?: string;
}

async function getWebSocketUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:9222/json/version', (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          const versionInfo = JSON.parse(data);
          if (versionInfo.webSocketDebuggerUrl) {
            resolve(versionInfo.webSocketDebuggerUrl);
          } else {
            reject(new Error('No WebSocket debugger URL found in version info'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

async function testChromeConnection(): Promise<void> {
  console.log('Getting WebSocket URL from Chrome debugging...');

  try {
    const wsUrl = await getWebSocketUrl();
    console.log(`Found WebSocket URL: ${wsUrl}`);

    // Connect to existing Chrome instance
    const browser = await chromium.connectOverCDP(wsUrl);
    console.log('✅ Connected to Chrome successfully!');

    // Get existing pages from the default context
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts available');
    }

    const context = contexts[0]; // Default context
    const pages = context.pages();
    if (pages.length === 0) {
      throw new Error('No pages available in the browser');
    }

    // Use the first page (typically the active/most recently used tab)
    // Other tabs remain untouched
    const page = pages[0];
    console.log(`✅ Using active tab (page 1 of ${pages.length}): ${await page.url()}`);
    console.log(`ℹ️  Other ${pages.length - 1} tabs remain unchanged`);

    // Navigate to Google
    console.log('Navigating to Google...');
    await page.goto('https://www.google.com');

    const title = await page.title();
    console.log(`✅ Page loaded successfully! Title: "${title}"`);

    // Wait 3 seconds (tab stays open)
    console.log('Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ Chrome remote debugging test complete - connection and navigation working!');
    console.log('ℹ️  Tab remains open in Chrome for manual inspection');

    // Close connection
    await browser.close();
    console.log('✅ Browser connection closed.');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testChromeConnection();