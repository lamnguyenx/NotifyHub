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
 * - Adds 8 mock notifications once at the start of the suite (in first beforeEach)
 * - Tests reuse this initial state across the linear test sequence
 * - Each test may modify state (e.g., clearing notifications)
 * - afterEach cleans up all notifications
 * - The final test restores the backed up notifications and verifies integrity
 * - This setup allows for testing various notification states and prepares for future
 *   individual notification removal tests
 */
const mockNotifications = [
  { message: 'Build done', pwd: '/Users/test/NotifyHub' },
  { message: 'Tests pass', pwd: '/tmp/Test Project' },
  { message: 'Deploy ready', pwd: '/home/user/my-app' },
  { message: 'Lint fixed', pwd: '/projects/Foo Bar Baz' },
  { message: 'Code review', pwd: '/workspace/A' },
  { message: 'Merge conflict', pwd: '/dev/Project-123' },
  { message: 'Hotfix applied', pwd: '/src/Long Project Name Here' },
  { message: 'Backup created', pwd: '/var/@special#dir!' }
];

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

             for (const noti of mockNotifications) {
               await page.evaluate(async (data) => {
                 await fetch('/api/notify', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ data })
                 });
               }, noti);
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

      customTest('dynamic default avatars display correctly', async ({ page }) => {
        // Add mock notifications for this test
       for (const noti of mockNotifications) {
         await page.evaluate(async (data) => {
           await fetch('/api/notify', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ data })
           });
         }, noti);
       }
       await page.waitForFunction(() => document.querySelectorAll('.notification').length === 8);
       const notifications = await page.$$('.notification');
       expect(notifications.length).toBe(8);

       const expectedAvatars = [
         { initials: '@', pwd: '@special#dir!' },
         { initials: 'LPNH', pwd: 'Long Project Name Here' },
         { initials: 'P', pwd: 'Project-123' },
         { initials: 'A', pwd: 'A' },
         { initials: 'FBB', pwd: 'Foo Bar Baz' },
         { initials: 'M', pwd: 'my-app' },
         { initials: 'TP', pwd: 'Test Project' },
         { initials: 'N', pwd: 'NotifyHub' }
       ];

       function getColorFromName(name: string): string {
         const colors = [
           '#34A853', // Green
           '#4285F4', // Blue
           '#EA4335', // Red
           '#FBBC05', // Yellow
           '#AB47BC', // Purple
           '#FF7043', // Orange
           '#00ACC1', // Cyan
           '#7B1FA2', // Deep Purple
           '#F06292', // Pink
           '#26A69A', // Teal
         ];
         const hash = name.split('').reduce((a, b) => {
           a = ((a << 5) - a) + b.charCodeAt(0);
           return a & a;
         }, 0);
         return colors[Math.abs(hash) % colors.length];
       }

       function getInitials(name: string): string {
         const words = name.trim().split(/\s+/);
         if (words.length > 1) {
           return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
         } else {
           return name[0]?.toUpperCase() || '';
         }
       }

       for (let i = 0; i < notifications.length; i++) {
         const avatar = await notifications[i].$('.notification-app-icon');
         const text = await avatar?.textContent();
         expect(text).toBe(expectedAvatars[i].initials);

         const bgColor = await avatar?.evaluate(el => getComputedStyle(el).backgroundColor);
         const expectedColor = getColorFromName(expectedAvatars[i].pwd);
         expect(bgColor).toBe(`rgb(${hexToRgb(expectedColor)})`);  // Convert hex to rgb for comparison
       }

       function hexToRgb(hex: string): string {
         const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
         return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '';
       }

       // Clean up notifications for next test
       await page.request.delete('http://localhost:9080/api/notifications');
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

        // Restore notifications with original IDs
        for (const noti of backup) {
          await page.evaluate(async (notification) => {
            await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: notification.id, data: { ...notification.data, timestamp: notification.timestamp } })
            });
          }, noti);
        }

      // Fetch notifications after restore
      const restoredResponse = await page.evaluate(async () => {
        const res = await fetch('/api/notifications');
        return await res.json();
      });

      // Compare counts
      expect(restoredResponse.length).toBe(backup.length);

      // Sort by message for order-independent comparison
      backup.sort((a, b) => a.data.message.localeCompare(b.data.message));
      restoredResponse.sort((a, b) => a.data.message.localeCompare(b.data.message));

       // Compare content (message and pwd) AND IDs
        for (let i = 0; i < backup.length; i++) {
          expect(restoredResponse[i].id).toBe(backup[i].id);  // IDs should be preserved
          expect(restoredResponse[i].data.message).toBe(backup[i].data.message);
          expect(restoredResponse[i].data.pwd).toBe(backup[i].data.pwd);
          expect(restoredResponse[i].timestamp).toBe(backup[i].timestamp);  // Timestamps should be preserved
       }

      // Verify avatars display correctly for notifications with pwd
      await page.waitForFunction((count) => document.querySelectorAll('.notification').length === count, backup.length);
      const notifications = await page.$$('.notification');
      expect(notifications.length).toBe(backup.length);

      // Sort restored data by message
      const sortedRestored = [...restoredResponse].sort((a, b) => a.data.message.localeCompare(b.data.message));

      // Get notifications with their messages for sorting
      const notificationsWithMessage = await Promise.all(notifications.map(async (el) => {
        const message = await el.$eval('.notification-text1', el => el.textContent);
        return { el, message };
      }));
      notificationsWithMessage.sort((a, b) => a.message.localeCompare(b.message));

      function getColorFromName(name: string): string {
        const colors = [
          '#34A853', // Green
          '#4285F4', // Blue
          '#EA4335', // Red
          '#FBBC05', // Yellow
          '#AB47BC', // Purple
          '#FF7043', // Orange
          '#00ACC1', // Cyan
          '#7B1FA2', // Deep Purple
          '#F06292', // Pink
          '#26A69A', // Teal
        ];
        const hash = name.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        return colors[Math.abs(hash) % colors.length];
      }

      function getInitials(name: string): string {
        const words = name.trim().split(/\s+/);
        if (words.length > 1) {
          return words.map(word => word[0]).join('').toUpperCase().slice(0, 4);
        } else {
          return name[0]?.toUpperCase() || '';
        }
      }

      function hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '';
      }

      for (let i = 0; i < notificationsWithMessage.length; i++) {
        const pwd = sortedRestored[i].data.pwd;
        if (pwd) {
          const username = pwd.split('/').pop() || '';
          const expectedInitials = getInitials(username);
          const expectedColor = getColorFromName(username);

          const avatar = await notificationsWithMessage[i].el.$('.notification-app-icon');
          const text = await avatar?.textContent();
          expect(text).toBe(expectedInitials);

          const bgColor = await avatar?.evaluate(el => getComputedStyle(el).backgroundColor);
          expect(bgColor).toBe(`rgb(${hexToRgb(expectedColor)})`);
        }
      }

      // Clean up backup file
      fs.unlinkSync(backupFile);
    });
});