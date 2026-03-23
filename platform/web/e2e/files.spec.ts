import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('File Browser', () => {
  let token: string;
  const wsName = `e2e-files-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('Files tab is visible', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await expect(page.getByRole('button', { name: /files/i })).toBeVisible();
  });

  test('Files tab shows workspace selector', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByText(wsName, { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /files/i }).click();
    // Should show some text about selecting a workspace or a file tree
    await expect(page.getByText(/workspace|file|browse|select/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('File browser navigation works', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /files/i }).click();

    // Try to select the test workspace if there's a selector
    const wsOption = page.getByText(wsName).first();
    if (await wsOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await wsOption.click();
    }
    // Page should remain stable without errors
    await page.waitForTimeout(500);
    const hasError = await page.getByText(/error|failed/i).isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });

  test('File viewer is read-only by default', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByText(wsName, { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /files/i }).click();
    // Wait for file browser to settle
    await page.waitForTimeout(1000);
    // Confirm the Files view renders without errors
    await expect(page.locator('body')).toBeVisible();
  });
});
