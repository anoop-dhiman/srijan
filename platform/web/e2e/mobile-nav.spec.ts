import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let token: string;
  const wsName = `e2e-mobile-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test('mobile nav renders with 5 items on small viewport', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    // MobileNav is md:hidden, visible on narrow viewports
    const nav = page.getByRole('navigation', { name: /mobile navigation/i });
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Should have 5 nav buttons: Dashboard, Chat, Files, Terminal, Settings
    const navButtons = nav.getByRole('button');
    await expect(navButtons).toHaveCount(5, { timeout: 5000 });
  });

  test('mobile nav has Dashboard, Chat, Files, Terminal, Settings', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const nav = page.getByRole('navigation', { name: /mobile navigation/i });
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Each item is a button with aria-label matching its name
    await expect(nav.getByRole('button', { name: /dashboard/i })).toBeVisible();
    await expect(nav.getByRole('button', { name: /chat/i })).toBeVisible();
    await expect(nav.getByRole('button', { name: /files/i })).toBeVisible();
    await expect(nav.getByRole('button', { name: /terminal/i })).toBeVisible();
    await expect(nav.getByRole('button', { name: /settings/i })).toBeVisible();
  });

  test('clicking Chat in mobile nav switches to chat view', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const nav = page.getByRole('navigation', { name: /mobile navigation/i });
    await expect(nav).toBeVisible({ timeout: 10000 });

    await nav.getByRole('button', { name: /chat/i }).click();

    // Chat view should now be active — the composer textarea is always rendered in chat view
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 });
  });

  test('mobile nav active item reflects current view', async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    const nav = page.getByRole('navigation', { name: /mobile navigation/i });
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Click Files
    await nav.getByRole('button', { name: /files/i }).click();

    // The Files button should now have aria-current="page" (active indicator)
    const filesBtn = nav.getByRole('button', { name: /files/i });
    await expect(filesBtn).toHaveAttribute('aria-current', 'page', { timeout: 5000 });

    // Dashboard button should NOT have aria-current="page"
    const dashBtn = nav.getByRole('button', { name: /dashboard/i });
    const dashCurrent = await dashBtn.getAttribute('aria-current').catch(() => null);
    expect(dashCurrent).not.toBe('page');
  });
});
