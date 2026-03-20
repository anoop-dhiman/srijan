import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Settings', () => {
  test('Settings tab is visible', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await expect(page.getByRole('button', { name: /settings/i })).toBeVisible();
  });

  test('AI Provider section is visible for admin', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/AI Provider|LLM Provider/i)).toBeVisible({ timeout: 5000 });
  });

  test('admin sees Users section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Users/i)).toBeVisible({ timeout: 5000 });
  });

  test('admin sees Spending section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Spending/i)).toBeVisible({ timeout: 5000 });
  });

  test('Spending section shows user spending limits', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    // Click Spending nav item
    await page.getByRole('button', { name: /spending/i }).click();
    await expect(page.getByText(/spending limit/i)).toBeVisible({ timeout: 5000 });
  });
});
