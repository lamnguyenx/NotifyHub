import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NotificationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async getNotificationCount(): Promise<number> {
    const notifications = this.page.locator('.card.mb-2.mx-auto');
    return await notifications.count();
  }

  async clearAllNotifications() {
    const clearButton = this.page.locator('button.btn.btn-outline-danger.btn-sm').filter({ hasText: 'Clear All' });
    await clearButton.click();
  }

  async expectNotificationCount(expectedCount: number) {
    const count = await this.getNotificationCount();
    expect(count).toBe(expectedCount);
  }

  async expectClearButtonEnabled(enabled: boolean) {
    const clearButton = this.page.locator('button.btn.btn-outline-danger.btn-sm').filter({ hasText: 'Clear All' });
    if (enabled) {
      await expect(clearButton).toBeEnabled();
    } else {
      await expect(clearButton).toBeDisabled();
    }
  }
}