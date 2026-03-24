import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Git Staging UI', () => {
  let token: string;
  const wsName = `e2e-git-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('changes button is visible in workspace git section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    // Dashboard is default view; locate the workspace card for our test workspace
    const card = page.locator('[data-testid="workspace-card"]').filter({ hasText: wsName });
    await expect(card).toBeVisible({ timeout: 15000 });
    // The Changes toggle button has data-testid="changes-toggle"
    const changesBtn = card.locator('[data-testid="changes-toggle"]');
    await expect(changesBtn).toBeVisible({ timeout: 10000 });
  });

  test('staging panel opens when changes button clicked', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const card = page.locator('[data-testid="workspace-card"]').filter({ hasText: wsName });
    await expect(card).toBeVisible({ timeout: 15000 });

    const changesBtn = card.locator('[data-testid="changes-toggle"]');
    await expect(changesBtn).toBeVisible({ timeout: 10000 });
    await changesBtn.click();

    // Staging panel should appear (data-testid="staging-panel")
    const stagingPanel = card.locator('[data-testid="staging-panel"]');
    await expect(stagingPanel).toBeVisible({ timeout: 5000 });
  });

  test('commit button is disabled without message', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const card = page.locator('[data-testid="workspace-card"]').filter({ hasText: wsName });
    await expect(card).toBeVisible({ timeout: 15000 });

    const changesBtn = card.locator('[data-testid="changes-toggle"]');
    await expect(changesBtn).toBeVisible({ timeout: 10000 });
    await changesBtn.click();

    const stagingPanel = card.locator('[data-testid="staging-panel"]');
    await expect(stagingPanel).toBeVisible({ timeout: 5000 });

    // Commit button should be disabled when message is empty (no text entered)
    const commitBtn = stagingPanel.getByRole('button', { name: /commit/i });
    await expect(commitBtn).toBeDisabled({ timeout: 5000 });
  });

  test('commit message input accepts text', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const card = page.locator('[data-testid="workspace-card"]').filter({ hasText: wsName });
    await expect(card).toBeVisible({ timeout: 15000 });

    const changesBtn = card.locator('[data-testid="changes-toggle"]');
    await expect(changesBtn).toBeVisible({ timeout: 10000 });
    await changesBtn.click();

    const stagingPanel = card.locator('[data-testid="staging-panel"]');
    await expect(stagingPanel).toBeVisible({ timeout: 5000 });

    // Type a commit message
    const commitInput = stagingPanel.getByLabel(/commit message/i);
    await expect(commitInput).toBeVisible({ timeout: 5000 });
    await commitInput.fill('test commit message');
    await expect(commitInput).toHaveValue('test commit message');
  });
});
