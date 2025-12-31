import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AppPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async toggleEditMode() {
    const button = this.page.locator('button').filter({ hasText: 'Edit Layout' }).or(this.page.locator('button').filter({ hasText: 'View Live' }));
    await button.click();
    await this.page.waitForTimeout(1000);
  }

  async isEditMode(): Promise<boolean> {
    const button = this.page.locator('button').filter({ hasText: 'Edit Layout' }).or(this.page.locator('button').filter({ hasText: 'View Live' }));
    const text = await button.textContent();
    return text === 'View Live';
  }

  async expectConnectionError(expected: boolean) {
    const alert = this.page.locator('.alert.alert-warning').filter({ hasText: 'Connection lost - retrying...' });
    if (expected) {
      await expect(alert).toBeVisible();
    } else {
      await expect(alert).toBeHidden();
    }
  }
}