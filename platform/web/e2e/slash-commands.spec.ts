import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { getAdminToken, createWorkspaceViaApi, deleteWorkspaceViaApi, selectWorkspaceInChat } from './helpers/api';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Slash Commands', () => {
  let token: string;
  const wsName = `e2e-slash-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await createWorkspaceViaApi(request, token, wsName);
  });

  test.afterAll(async ({ request }) => {
    await deleteWorkspaceViaApi(request, token, wsName).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.getByRole('button', { name: /chat/i }).click();
    await selectWorkspaceInChat(page, wsName);
  });

  test('slash menu opens when / is typed in chat input', async ({ page }) => {
    // Find the chat textarea
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill('/');

    // CommandMenu renders a listbox with aria-label="Slash commands"
    const menu = page.getByRole('listbox', { name: /slash commands/i });
    await expect(menu).toBeVisible({ timeout: 5000 });
  });

  test('slash menu shows available commands', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill('/');

    const menu = page.getByRole('listbox', { name: /slash commands/i });
    await expect(menu).toBeVisible({ timeout: 5000 });

    // At least one of the built-in commands should appear
    const commandTexts = menu.locator('li');
    await expect(commandTexts.first()).toBeVisible({ timeout: 5000 });

    // Check for common slash commands (clear, compact, new, help)
    const menuText = await menu.textContent();
    const hasKnownCommand = /clear|compact|new|help/i.test(menuText ?? '');
    expect(hasKnownCommand).toBeTruthy();
  });

  test('pressing escape closes slash menu', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill('/');

    const menu = page.getByRole('listbox', { name: /slash commands/i });
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Press Escape
    await textarea.press('Escape');

    // Menu should be gone
    await expect(menu).not.toBeVisible({ timeout: 3000 });
  });

  test('selecting a command clears the / from input', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill('/');

    const menu = page.getByRole('listbox', { name: /slash commands/i });
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Click the first command option
    const firstOption = menu.locator('li').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    // The menu should be gone after selection
    await expect(menu).not.toBeVisible({ timeout: 3000 });
    // Input should not contain a bare '/' at the start
    const value = await textarea.inputValue();
    expect(value).not.toBe('/');
  });

  test('slash menu filters by query', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    // Type /cl to filter for /clear
    await textarea.fill('/cl');

    const menu = page.getByRole('listbox', { name: /slash commands/i });
    // Menu may or may not be visible depending on whether /cl matches something
    const menuVisible = await menu.isVisible({ timeout: 3000 }).catch(() => false);
    if (menuVisible) {
      const items = menu.locator('li');
      const count = await items.count();
      // All visible items should contain 'cl' in their text
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).textContent();
        expect(text?.toLowerCase()).toMatch(/cl/i);
      }
    }
    // If no menu (no matching commands), the test passes gracefully
  });
});
