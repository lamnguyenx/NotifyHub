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
    const clearButton = this.page.locator('button').filter({ hasText: 'Clear All' });
    await clearButton.click();
  }

  async expectNotificationCount(expectedCount: number) {
    const count = await this.getNotificationCount();
    expect(count).toBe(expectedCount);
  }

   async expectClearButtonEnabled(enabled: boolean) {
     const clearButton = this.page.locator('button').filter({ hasText: 'Clear All' });
     await expect(clearButton).toBeVisible();
     if (enabled) {
       await expect(clearButton).toBeEnabled();
     } else {
       // Check if button is disabled by checking for disabled attribute
       const isDisabled = await clearButton.evaluate((el: HTMLButtonElement) => el.disabled);
       expect(isDisabled).toBe(true);
     }
   }
}