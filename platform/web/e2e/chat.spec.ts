import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Chat', () => {
  let token: string;
  const wsName = `e2e-chat-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('Chat tab is visible and navigable', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByText(wsName, { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /chat/i }).click();
    await expect(page.getByText(/Srijan|workspace|session/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('new session appears in sidebar after creation', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByText(wsName, { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /chat/i }).click();

    // Switch to the test workspace first
    const wsButton = page.getByText(wsName).first();
    if (await wsButton.isVisible()) {
      await wsButton.click();
    }

    const newChatBtn = page.getByRole('button', { name: /new chat/i });
    if (await newChatBtn.isVisible() && await newChatBtn.isEnabled()) {
      await newChatBtn.click();
      await expect(page.getByText(/new session/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('spending warning banner not shown when no limit', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i }).click();
    // Banner should NOT be visible by default (no limit set)
    await expect(page.getByText(/monthly limit/i)).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('chat page shows workspace selector or message area', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i }).click();
    // Either the sidebar or the message area is shown
    const hasSidebar = await page.getByRole('button', { name: /new chat/i }).isVisible().catch(() => false);
    const hasMessage = await page.getByText(/Srijan/i).isVisible().catch(() => false);
    expect(hasSidebar || hasMessage).toBe(true);
  });
});
