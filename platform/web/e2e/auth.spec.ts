import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Authentication', () => {
  test('login with valid credentials shows dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/username/i).fill('admin');
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Workspaces')).toBeVisible({ timeout: 10000 });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/username/i).fill('admin');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|failed|unauthorized/i)).toBeVisible({ timeout: 5000 });
  });

  test('token persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/username/i).fill('admin');
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Workspaces')).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText('Workspaces')).toBeVisible({ timeout: 10000 });
  });

  test('unauthenticated user sees login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('login form has username and password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });
});
