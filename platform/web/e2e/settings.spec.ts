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
    await expect(page.getByText(/AI Provider|LLM Provider/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('admin sees Users section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Users/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('admin sees Spending section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Spending/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Spending section shows user spending limits', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    // Click Spending nav item
    await page.getByRole('button', { name: /spending/i }).click();
    await expect(page.getByText(/spending limit/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Claude Account OAuth section is visible under AI Provider', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /ai provider/i }).click();
    await expect(page.getByText(/claude account/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Agent Roles section is visible for admin', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /agent roles/i }).click();
    await expect(page.getByText(/coder|reviewer|devops|planner/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('default agent roles are seeded', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /agent roles/i }).click();
    // All four default roles should be visible
    await expect(page.getByText(/full.stack coder/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/code reviewer/i)).toBeVisible({ timeout: 5000 });
  });
});
