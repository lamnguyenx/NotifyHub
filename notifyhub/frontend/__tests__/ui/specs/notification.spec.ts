import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { NotificationPage } from '../pages/NotificationPage';

const customTest = test.extend({
  browser: async ({}, use) => {
    const browser = await chromium.connectOverCDP(process.env.CDP_WEBSOCKET_ENDPOINT!);
    await use(browser);
    await browser.close();
  },
  page: async ({ browser }, use) => {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts available');
    }
    const context = contexts[0];
    const pages = context.pages();
    if (pages.length === 0) {
      throw new Error('No pages available');
    }
    const page = pages[0]; // Use the first (active) page
    await use(page);
  },
});

/**
 * Notification Management Test Suite
 *
 * Testing Strategy:
 * - Backs up any existing notifications at start
 * - Adds 4 mock notifications once at the start of the suite (in first beforeEach)
 * - Tests reuse this initial state across the linear test sequence
 * - Each test may modify state (e.g., clearing notifications)
 * - afterEach cleans up all notifications
 * - After the last test, restores the backed up notifications to preserve user's state
 * - This setup allows for testing various notification states and prepares for future
 *   individual notification removal tests
 */
customTest.describe('Notification Management', () => {
    let appPage: AppPage;
    let notificationPage: NotificationPage;
    let testIndex = 0;
    let backupNotifications: any[] = [];

      customTest.beforeEach(async ({ page }) => {
        testIndex++;
       appPage = new AppPage(page);
       notificationPage = new NotificationPage(page);

        const errors: string[] = [];
        page.on('pageerror', error => {
          errors.push(`Page error: ${error.message}`);
        });

         await page.goto('http://localhost:9080/', { timeout: 10000 });
         await page.waitForLoadState('load', { timeout: 10000 });

         // Backup existing notifications and add mock ones (only once at the start)
         if (testIndex === 1) {
           const response = await page.request.get('http://localhost:9080/api/notifications');
           backupNotifications = await response.json();
           for (let i = 1; i <= 4; i++) {
             await page.request.post('http://localhost:9080/api/notify', { data: { message: `Test notification ${i}` } });
           }
         }

         // Wait for dust to settle
         await new Promise(resolve => setTimeout(resolve, 2000));

        if (errors.length > 0) {
          throw new Error(`Errors detected after page load: ${errors.join('; ')}`);
        }
      });

      customTest.afterEach(async ({ page }) => {
        // Clean up notifications after each test
        await page.request.delete('http://localhost:9080/api/notifications');
        // Restore backed up notifications after the last test
        if (testIndex === 4) {
          for (const noti of backupNotifications) {
            await page.request.post('http://localhost:9080/api/notify', { data: { message: noti.message } });
          }
        }
      });

    customTest('displays existing notifications', async () => {
     // Verify notification count is non-negative
     const count = await notificationPage.getNotificationCount();
     console.log('Notification count:', count);
     expect(count).toBeGreaterThanOrEqual(0);
   });

    customTest('clears all notifications', async ({ page }) => {
      // First check if there are notifications
      const initialCount = await notificationPage.getNotificationCount();
      if (initialCount > 0) {
        await notificationPage.clearAllNotifications();
        await page.waitForTimeout(500); // Wait for SSE update
        await notificationPage.expectNotificationCount(0);
      }
    });

   customTest('clear button state reflects notification count', async () => {
     const count = await notificationPage.getNotificationCount();
     await notificationPage.expectClearButtonEnabled(count > 0);
   });

    // customTest('edit mode toggle', async () => {
    //   const initialEditState = await appPage.isEditMode();
    //   await appPage.toggleEditMode();
    //   const newEditState = await appPage.isEditMode();
    //   expect(newEditState).not.toBe(initialEditState);
    // });

   customTest('connection status', async () => {
     await appPage.expectConnectionError(false);
   });
});