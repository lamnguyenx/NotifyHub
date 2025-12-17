import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AppPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async toggleEditMode() {
    const button = this.page.locator('button').filter({ hasText: 'Edit Layout' }).or(this.page.locator('button').filter({ hasText: 'View Live' }));
    await button.click();
  }

  async isEditMode(): Promise<boolean> {
    const button = this.page.locator('button').filter({ hasText: 'View Live' });
    return await button.isVisible();
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