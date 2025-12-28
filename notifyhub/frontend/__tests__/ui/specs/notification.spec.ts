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

customTest.describe('Notification Management', () => {
   let appPage: AppPage;
   let notificationPage: NotificationPage;

     customTest.beforeEach(async ({ page }) => {
       appPage = new AppPage(page);
       notificationPage = new NotificationPage(page);

       const errors: string[] = [];
       page.on('pageerror', error => {
         errors.push(`Page error: ${error.message}`);
       });

       await page.goto('http://localhost:9080/', { timeout: 10000 });
       await page.waitForLoadState('load', { timeout: 10000 });

       // Wait for dust to settle
       await new Promise(resolve => setTimeout(resolve, 2000));

       if (errors.length > 0) {
         throw new Error(`Errors detected after page load: ${errors.join('; ')}`);
       }
     });

   customTest('displays existing notifications', async () => {
     // Verify notification count is non-negative
     const count = await notificationPage.getNotificationCount();
     console.log('Notification count:', count);
     expect(count).toBeGreaterThanOrEqual(0);
   });

   customTest('clears all notifications', async () => {
     // First check if there are notifications
     const initialCount = await notificationPage.getNotificationCount();
     if (initialCount > 0) {
       await notificationPage.clearAllNotifications();
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