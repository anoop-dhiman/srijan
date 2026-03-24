import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Thinking Mode Selector', () => {
  let token: string;
  const wsName = `e2e-thinking-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('thinking mode selector is visible in chat view', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    // Navigate to Chat view (enabled once a workspace exists)
    await page.getByRole('button', { name: /chat/i, disabled: false }).click();
    // ThinkingModeSelector renders a group with aria-label="Thinking mode"
    const selector = page.getByRole('group', { name: /thinking mode/i });
    await expect(selector).toBeVisible({ timeout: 10000 });
  });

  test('can change thinking mode to extended', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i, disabled: false }).click();

    const selector = page.getByRole('group', { name: /thinking mode/i });
    await expect(selector).toBeVisible({ timeout: 10000 });

    // Click the Extended button
    const extendedBtn = selector.getByRole('button', { name: /extended/i });
    await expect(extendedBtn).toBeVisible({ timeout: 5000 });
    await extendedBtn.click();

    // The button should now be pressed (aria-pressed="true")
    await expect(extendedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('can change thinking mode back to none', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i, disabled: false }).click();

    const selector = page.getByRole('group', { name: /thinking mode/i });
    await expect(selector).toBeVisible({ timeout: 10000 });

    // First activate Extended
    const extendedBtn = selector.getByRole('button', { name: /extended/i });
    await extendedBtn.click();
    await expect(extendedBtn).toHaveAttribute('aria-pressed', 'true');

    // Now click None
    const noneBtn = selector.getByRole('button', { name: /none/i });
    await noneBtn.click();
    await expect(noneBtn).toHaveAttribute('aria-pressed', 'true');
    // Extended should no longer be pressed
    await expect(extendedBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('thinking mode persists to new messages', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i, disabled: false }).click();

    const selector = page.getByRole('group', { name: /thinking mode/i });
    await expect(selector).toBeVisible({ timeout: 10000 });

    // Change mode to Medium
    const mediumBtn = selector.getByRole('button', { name: /medium/i });
    await mediumBtn.click();
    await expect(mediumBtn).toHaveAttribute('aria-pressed', 'true');

    // Click elsewhere on the page (e.g. the message area)
    await page.locator('body').click({ position: { x: 400, y: 400 } });

    // Selector should still show Medium as active
    await expect(mediumBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
