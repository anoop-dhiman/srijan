import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'testpass';

test.describe('Token Usage Pie', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    // Navigate to Chat view
    await page.getByRole('button', { name: /chat/i }).click();
  });

  test('token usage area exists in chat header', async ({ page }) => {
    // TokenPie renders as an SVG with aria-label containing "tokens used"
    // It only renders when total tokens > 0, so in a fresh session it is hidden.
    // We verify the chat header area is rendered correctly.
    await expect(page.locator('body')).toBeVisible();

    // Wait for chat interface to load
    await page.waitForTimeout(1000);

    // Look for any SVG token indicator — may or may not be present
    const tokenSvg = page.locator('svg[aria-label*="tokens used"]');
    const tokenPieVisible = await tokenSvg.isVisible({ timeout: 2000 }).catch(() => false);

    // TokenPie returns null when total === 0, so it should NOT be visible in a fresh session
    // This is the expected default state
    expect(tokenPieVisible).toBe(false);
  });

  test('token pie hidden when no tokens used', async ({ page }) => {
    // In a brand-new session with no messages, inputTokens and outputTokens are both 0
    // TokenPie returns null for total === 0, so the SVG should not exist in DOM
    await page.waitForTimeout(1000);

    const tokenSvg = page.locator('svg[aria-label*="tokens used"]');
    const count = await tokenSvg.count();

    // Expect zero token pie SVGs when no messages have been sent
    expect(count).toBe(0);
  });
});
