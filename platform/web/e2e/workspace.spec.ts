import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Workspace management', () => {
  let token: string;
  const wsName = `e2e-ws-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('create workspace via UI and see it in dashboard', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /new workspace/i }).click();
    await page.getByPlaceholder(/workspace name|name/i).first().fill(wsName);
    await page.getByRole('button', { name: /create workspace/i }).click();
    await expect(page.getByText(wsName)).toBeVisible({ timeout: 15000 });
  });

  test('workspace appears in the list after creation', async ({ page, request }) => {
    const ws2 = `e2e-list-${Date.now()}`;
    await createWorkspaceViaApi(request, token, ws2);
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await expect(page.getByText(ws2)).toBeVisible({ timeout: 10000 });
    await deleteWorkspaceViaApi(request, token, ws2).catch(() => {});
  });

  test('delete workspace removes it from list', async ({ page, request }) => {
    const ws3 = `e2e-del-${Date.now()}`;
    await createWorkspaceViaApi(request, token, ws3);
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await expect(page.getByText(ws3)).toBeVisible({ timeout: 10000 });

    // Find delete button for this workspace and click it
    const card = page.locator(`text=${ws3}`).locator('../..').first();
    await card.getByTitle(/delete workspace/i).click();
    // Confirm deletion in dialog
    await page.getByRole('button', { name: /delete workspace/i }).last().click();
    await expect(page.getByText(ws3)).not.toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows workspaces section', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await expect(page.getByText('Workspaces')).toBeVisible();
    await expect(page.getByRole('button', { name: /new workspace/i })).toBeVisible();
  });
});
