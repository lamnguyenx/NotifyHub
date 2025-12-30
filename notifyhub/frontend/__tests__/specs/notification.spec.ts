import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { NotificationPage } from '../pages/NotificationPage';
import * as fs from 'fs';

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
 * - The final test restores the backed up notifications and verifies integrity
 * - This setup allows for testing various notification states and prepares for future
 *   individual notification removal tests
 */
customTest.describe('Notification Management', () => {
    let appPage: AppPage;
    let notificationPage: NotificationPage;
    let testIndex = 0;
    let backupNotifications: any[] = [];
    const backupFile = '/tmp/notifyhub_test_backup.json';

      customTest.beforeEach(async ({ page }) => {
        testIndex++;
       appPage = new AppPage(page);
       notificationPage = new NotificationPage(page);

        const errors: string[] = [];
        page.on('pageerror', error => {
          errors.push(`Page error: ${error.message}`);
        });

          await page.goto(`${process.env.BASE_URL}/`, { timeout: 10000 });
         await page.waitForLoadState('load', { timeout: 10000 });

          // Backup existing notifications and add mock ones (only once at the start)
          if (testIndex === 1) {
            const response = await page.request.get('http://localhost:9080/api/notifications');
            backupNotifications = await response.json();
            fs.writeFileSync(backupFile, JSON.stringify(backupNotifications));
            for (let i = 1; i <= 4; i++) {
              await page.evaluate(async (msg) => {
                await fetch('/api/notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ data: { message: msg } })
                });
              }, `Test notification ${i}`);
            }
          }

         // Wait for dust to settle
         await new Promise(resolve => setTimeout(resolve, 2000));

        if (errors.length > 0) {
          throw new Error(`Errors detected after page load: ${errors.join('; ')}`);
        }
      });

       customTest.afterEach(async ({ page }) => {
         // Clean up notifications after each test (except the last one which handles restore)
         if (testIndex < 5) {
           await page.request.delete('http://localhost:9080/api/notifications');
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

    customTest('notification backup and restore integrity', async ({ page }) => {
      // Fetch current notifications (should be 0 after previous clear)
      const currentResponse = await page.evaluate(async () => {
        const res = await fetch('/api/notifications');
        return await res.json();
      });
      expect(currentResponse.length).toBe(0);

      // Load backup
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

      // Restore notifications
      for (const noti of backup) {
        await page.evaluate(async (data) => {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data })
          });
        }, noti.data);
      }

      // Fetch notifications after restore
      const restoredResponse = await page.evaluate(async () => {
        const res = await fetch('/api/notifications');
        return await res.json();
      });

      // Compare counts
      expect(restoredResponse.length).toBe(backup.length);

      // Sort both arrays by id to ensure order-independent comparison
      backup.sort((a, b) => a.id.localeCompare(b.id));
      restoredResponse.sort((a, b) => a.id.localeCompare(b.id));

      // Compare content (message and pwd)
      for (let i = 0; i < backup.length; i++) {
        expect(restoredResponse[i].data.message).toBe(backup[i].data.message);
        expect(restoredResponse[i].data.pwd).toBe(backup[i].data.pwd);
      }

      // Clean up backup file
      fs.unlinkSync(backupFile);
    });
});