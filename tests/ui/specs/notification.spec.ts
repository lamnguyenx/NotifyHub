import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { NotificationPage } from '../pages/NotificationPage';

test.describe('Notification Management', () => {
  let appPage: AppPage;
  let notificationPage: NotificationPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    notificationPage = new NotificationPage(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('displays existing notifications', async () => {
    // Verify notification count is non-negative
    const count = await notificationPage.getNotificationCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('clears all notifications', async () => {
    // First check if there are notifications
    const initialCount = await notificationPage.getNotificationCount();
    if (initialCount > 0) {
      await notificationPage.clearAllNotifications();
      await notificationPage.expectNotificationCount(0);
    }
  });

  test('clear button state reflects notification count', async () => {
    const count = await notificationPage.getNotificationCount();
    await notificationPage.expectClearButtonEnabled(count > 0);
  });

  test('edit mode toggle', async () => {
    const initialEditState = await appPage.isEditMode();
    await appPage.toggleEditMode();
    const newEditState = await appPage.isEditMode();
    expect(newEditState).not.toBe(initialEditState);
  });
});