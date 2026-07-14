import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NotificationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async getNotificationCount(): Promise<number> {
    // Count notification elements
    const notifications = this.page.locator('.notification');
    return await notifications.count();
  }

  async clearAllNotifications() {
    const clearButton = this.page.locator('.clear-all-button');
    await clearButton.click();
  }

  async expectNotificationCount(expectedCount: number) {
    const count = await this.getNotificationCount();
    expect(count).toBe(expectedCount);
  }

   async expectClearButtonEnabled(enabled: boolean) {
     const clearButton = this.page.locator('.clear-all-button');
     if (enabled) {
       await expect(clearButton).toBeVisible();
       await expect(clearButton).toBeEnabled();
     } else {
       // When disabled, the button is hidden (display: none)
       await expect(clearButton).not.toBeVisible();
     }
   }
}