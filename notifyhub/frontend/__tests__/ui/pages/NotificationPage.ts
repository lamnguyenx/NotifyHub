import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class NotificationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async getNotificationCount(): Promise<number> {
    // Count bell emojis which are in each notification card
    const notifications = this.page.locator('text=🔔');
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
      // Check if button is disabled by checking for disabled class or reduced opacity
      const hasDisabledClass = await clearButton.evaluate(el => el.classList.contains('mantine-Button-disabled'));
      const opacity = await clearButton.evaluate(el => getComputedStyle(el).opacity);
      const isVisuallyDisabled = hasDisabledClass || parseFloat(opacity) < 1;
      expect(isVisuallyDisabled).toBe(true);
    }
  }
}